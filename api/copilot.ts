import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

/* ----------------------------------
   CORS CONFIG (LOCKED)
---------------------------------- */

const ALLOWED_ORIGINS = [
  "https://sensihi.com",
  "https://www.sensihi.com",
]

function setCors(res, origin?: string) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

/* ----------------------------------
   Clients (LOCKED)
---------------------------------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/* ----------------------------------
   RATE LIMITING (SAFE, NEW)
---------------------------------- */

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const MAX_REQUESTS_PER_IP = 10

const ipBuckets = new Map<
  string,
  { count: number; resetAt: number }
>()

function checkRateLimit(ip: string) {
  const now = Date.now()
  const bucket = ipBuckets.get(ip)

  if (!bucket || now > bucket.resetAt) {
    ipBuckets.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (bucket.count >= MAX_REQUESTS_PER_IP) {
    return false
  }

  bucket.count++
  return true
}

/* ----------------------------------
   SESSION GUARD (SAFE, NEW)
---------------------------------- */

const MAX_MESSAGES_PER_SESSION = 40
const sessionBuckets = new Map<string, number>()

function getSessionId(req): string {
  const headerSession = req.headers["x-session-id"]
  if (typeof headerSession === "string") return headerSession

  const ua = req.headers["user-agent"] || "unknown"
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"

  return crypto
    .createHash("sha256")
    .update(ua + ip)
    .digest("hex")
}

function checkSessionLimit(sessionId: string) {
  const count = sessionBuckets.get(sessionId) || 0

  if (count >= MAX_MESSAGES_PER_SESSION) {
    return false
  }

  sessionBuckets.set(sessionId, count + 1)
  return true
}

/* ----------------------------------
   Helpers (SAFE)
---------------------------------- */

function isValidReference(meta?: any) {
  if (!meta?.url || !meta?.title) return false

  const url = meta.url.toLowerCase()

  if (
    url === "https://sensihi.com" ||
    url.endsWith("/") ||
    url.includes("/contact") ||
    url.includes("/about") ||
    url.includes("#")
  ) {
    return false
  }

  return (
    url.includes("/insights/") ||
    url.includes("/blog") ||
    url.includes("/case")
  )
}

/**
 * FINAL formatter — forces visual structure
 * SAFE: text-only, zero logic impact
 */
function formatAnswer(text: string) {
  if (!text) return text

  let out = text.trim()

  out = out.replace(
    /^([A-Za-z0-9 ,\-()]+):\s*/m,
    "$1:\n\n"
  )

  out = out.replace(
    /Key Points:\s*/gi,
    "\n\nKey Points:\n"
  )

  out = out.replace(/\s*•\s*/g, "\n• ")
  out = out.replace(/\n•/g, "\n\n•")
  out = out.replace(/\n{3,}/g, "\n\n")

  return out.trim()
}

/* ----------------------------------
   Handler
---------------------------------- */

export default async function handler(req, res) {
  const origin = req.headers.origin
  setCors(res, origin)

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false })
  }

  /* ---------- NEW: Rate limit ---------- */
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      ok: false,
      message:
        "You’re sending requests too quickly. Please wait a moment and try again.",
      references: [],
    })
  }

  /* ---------- NEW: Session guard ---------- */
  const sessionId = getSessionId(req)

  if (!checkSessionLimit(sessionId)) {
    return res.status(429).json({
      ok: false,
      message:
        "You’ve reached the maximum number of questions for this session. Please refresh the page or come back later.",
      references: [],
    })
  }

  try {
    const { message } = req.body

    if (!message || typeof message !== "string") {
      return res.status(400).json({ ok: false })
    }

    /* ----------------------------------
       1. Embed query
    ---------------------------------- */
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    })

    const queryEmbedding = embeddingRes.data[0].embedding

    /* ----------------------------------
       2. Vector search (LOCKED WORKING VALUES)
    ---------------------------------- */
    const { data: matches, error } = await supabase.rpc(
      "match_sensihi_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.15,
        match_count: 6,
      }
    )

    if (error) {
      console.error("RPC error:", error)
      throw error
    }

    if (!matches || matches.length === 0) {
      return res.json({
        ok: true,
        message:
          "I don’t have relevant Sensihi information for that yet. Try asking about our AI solutions, insights, or how we work with teams.",
        references: [],
        cta: [
          { label: "Explore Insights", url: "/insights", type: "primary" },
          { label: "Contact Us", url: "/contact", type: "secondary" },
        ],
      })
    }

    /* ----------------------------------
       3. Build grounded context
    ---------------------------------- */
    const context = matches
      .slice(0, 4)
      .map(
        (m) =>
          `Title: ${m.metadata?.title}\n${m.content}`
      )
      .join("\n\n")

    /* ----------------------------------
       4. Generate answer
    ---------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Sensihi Copilot.

Formatting rules (IMPORTANT):
- Plain text only (no markdown)
- Clear section titles followed by a colon
- Blank line between sections
- Use section titles on their own line
- Bullet points must use the "•" character
- Bullet points can have short headings
- Short paragraphs, high clarity as ending below bullet points

Answer ONLY using provided context.
          `.trim(),
        },
        {
          role: "user",
          content: `Question: ${message}\n\nContext:\n${context}`,
        },
      ],
    })

    /* ----------------------------------
       5. CTA references (MAX 3)
    ---------------------------------- */
    const references = matches
      .filter((m) => isValidReference(m.metadata))
      .slice(0, 3)
      .map((m) => ({
        title: m.metadata.title,
        url: m.metadata.url,
      }))

    return res.json({
      ok: true,
      message: formatAnswer(
        completion.choices[0].message.content
      ),
      references,
    })
  } catch (err) {
    console.error("Copilot error:", err)
    return res.status(500).json({
      ok: true,
      message:
        "I ran into a temporary issue. Please try again in a moment.",
      references: [],
    })
  }
}
