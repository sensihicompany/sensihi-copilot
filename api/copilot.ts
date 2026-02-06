import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function handler(req, res) {
  try {
    const { message } = req.body
    if (!message) {
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
       2. Vector search in Postgres
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
      console.error(error)
      throw error
    }

    if (!matches || matches.length === 0) {
      return res.json({
        ok: true,
        message:
          "I don’t have relevant Sensihi information for that yet. Try asking about our solutions, insights, or working with Sensihi.",
        intent: "exploring",
        references: [],
      })
    }

    /* ----------------------------------
       3. Build context
    ---------------------------------- */
    const context = matches
      .map(
        (m, i) =>
          `Source ${i + 1}:\n${m.content}\nURL: ${m.metadata?.url}`
      )
      .join("\n\n")

    /* ----------------------------------
       4. Answer with citations
    ---------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Sensihi Copilot. Answer ONLY using the provided sources. Cite sources.",
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
    console.error(err)
    res.status(500).json({
      ok: true,
      message:
        "I ran into a temporary issue. Please try again in a moment.",
      references: [],
    })
  }
}
