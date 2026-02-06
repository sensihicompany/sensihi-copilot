import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

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

  // 1. Ensure title is isolated
  out = out.replace(
    /^([A-Za-z0-9 ,\-()]+):\s*/m,
    "$1:\n\n"
  )

  // 2. Force "Key Points:" onto its own line
  out = out.replace(
    /Key Points:\s*/gi,
    "\n\nKey Points:\n"
  )

  // 3. Force each bullet onto a new line
  out = out.replace(/\s*•\s*/g, "\n• ")

  // 4. Ensure spacing before bullet blocks
  out = out.replace(/\n•/g, "\n\n•")

  // 5. Clean excessive newlines
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
       4. Generate answer (PLAIN TEXT)
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
- Bullet points must use the "•" character
- Short paragraphs, high clarity

Answer structure:
1. Short title
2. One-sentence explanation
3. Key points as bullets

Content rules:
- Answer ONLY using provided context
- Do NOT include citations or source numbers
- Be confident, practical, and concise
          `.trim(),
        },
        {
          role: "user",
          content: `Question: ${message}\n\nContext:\n${context}`,
        },
      ],
    })

    /* ----------------------------------
       5. CTA references (MAX 3, REAL ONLY)
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
