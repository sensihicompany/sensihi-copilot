import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

/**
 * ⚠️ FORMAT CONTRACT — DO NOT BREAK
 *
 * The assistant MUST:
 * - Use a clear heading at the top
 * - Follow with a short summary (1–2 lines)
 * - Use bullet points with bold labels
 * - Avoid long paragraphs
 * - NEVER include inline citations like (Source 1)
 *
 * References are returned separately and shown as CTA pills.
 * Frontend rendering depends on this structure.
 */

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
   Helpers
---------------------------------- */

/** Allow only real, useful content pages */
function isValidReference(meta?: any) {
  if (!meta?.url || !meta?.title) return false

  const url = meta.url.toLowerCase()

  // Block generic or navigational pages
  if (
    url === "https://sensihi.com" ||
    url.endsWith("/") ||
    url.includes("/contact") ||
    url.includes("/about") ||
    url.includes("#")
  ) {
    return false
  }

  // Allow only real content
  return (
    url.includes("/insights/") ||
    url.includes("/blog") ||
    url.includes("/case")
  )
}

/** Boost /insights content slightly */
function relevanceScore(match) {
  const url = match.metadata?.url || ""
  const boost = url.includes("/insights/") ? 0.1 : 0
  return match.similarity + boost
}

/* ----------------------------------
   Handler
---------------------------------- */

export default async function handler(req, res) {
  const origin = req.headers.origin
  setCors(res, origin)

  /* ---- Preflight ---- */
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
       1. Embed the query
    ---------------------------------- */
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    })

    const queryEmbedding = embeddingRes.data[0].embedding

    /* ----------------------------------
       2. Vector search (TIGHTENED)
    ---------------------------------- */
    const { data: matches, error } = await supabase.rpc(
      "match_sensihi_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.25, // ⬅️ tightened safely
        match_count: 8,
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
          "### I don’t have a strong answer for that yet\n\nI don’t have enough Sensihi-specific context to answer confidently. You can explore our insights or ask about our services, AI strategy, or prototyping work.",
        intent: "exploring",
        references: [],
        cta: [
          { label: "Explore Insights", url: "/insights", type: "primary" },
          { label: "Contact Us", url: "/contact", type: "secondary" },
        ],
      })
    }

    /* ----------------------------------
       3. Rank + filter documents
    ---------------------------------- */
    const ranked = matches
      .map((m) => ({ ...m, score: relevanceScore(m) }))
      .sort((a, b) => b.score - a.score)
      .filter((m) => m.similarity >= 0.78) // ⬅️ confidence gate

    if (ranked.length === 0) {
      return res.json({
        ok: true,
        message:
          "### Not enough reliable context\n\nI couldn’t find strong enough Sensihi material to answer this accurately. Would you like to explore a related topic or our recent insights?",
        references: [],
      })
    }

    /* ----------------------------------
       4. Build clean context (NO citations)
    ---------------------------------- */
    const context = ranked
      .slice(0, 4)
      .map(
        (m) =>
          `Title: ${m.metadata?.title}\nContent: ${m.content}`
      )
      .join("\n\n")

    /* ----------------------------------
       5. Generate formatted answer
    ---------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Sensihi Copilot.

Follow these rules strictly:
- Start with a clear heading
- Add a short summary (1–2 sentences)
- Use bullet points with **bold labels**
- Add spacing between sections
- Avoid long paragraphs
- Do NOT include citations or source numbers
- Be concise, confident, and practical
          `.trim(),
        },
        {
          role: "user",
          content: `Question:\n${message}\n\nContext:\n${context}`,
        },
      ],
    })

    /* ----------------------------------
       6. Build CTA references (MAX 3)
    ---------------------------------- */
    const references = ranked
      .filter((m) => isValidReference(m.metadata))
      .slice(0, 3)
      .map((m) => ({
        title: m.metadata.title,
        url: m.metadata.url,
      }))

    return res.json({
      ok: true,
      message: completion.choices[0].message.content,
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
