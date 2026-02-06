import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

/* ----------------------------------
   CORS CONFIG
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
   Clients
---------------------------------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/* ----------------------------------
   Handler
---------------------------------- */

export default async function handler(req, res) {
  const origin = req.headers.origin
  setCors(res, origin)

  /* ---- Handle preflight ---- */
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
       2. Vector search
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
          "I don’t have relevant Sensihi information for that yet. Try asking about our solutions, insights, or working with Sensihi.",
        intent: "exploring",
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
      .map(
        (m, i) =>
          `Source ${i + 1}:\n${m.content}\nURL: ${m.metadata?.url}`
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
          content:
            "You are Sensihi Copilot. Answer ONLY using the provided sources. Cite sources when relevant.",
        },
        {
          role: "user",
          content: `Question: ${message}\n\nSources:\n${context}`,
        },
      ],
    })

    return res.json({
      ok: true,
      message: completion.choices[0].message.content,
      references: matches.map((m) => ({
        title: m.metadata?.title || "Sensihi",
        url: m.metadata?.url,
      })),
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
