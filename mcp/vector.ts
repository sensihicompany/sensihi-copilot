import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

/* ----------------------------------
   Clients (Edge-safe)
---------------------------------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/* ----------------------------------
   In-memory embedding cache
---------------------------------- */

const embeddingCache = new Map<string, number[]>()

/* ----------------------------------
   Heuristic: avoid wasteful embeddings
---------------------------------- */

function shouldEmbed(query: string) {
  if (!query) return false
  if (query.length < 12) return false
  return true
}

/* ----------------------------------
   Vector search (REFERENCE READY)
---------------------------------- */

export async function vectorSearch(query: string): Promise<
  Array<{
    content: string
    metadata: {
      url?: string
      title?: string
      type?: string
    }
    similarity?: number
  }>
> {
  if (!shouldEmbed(query)) return []

  let embedding: number[] | undefined

  /* -------- Embedding (cached) -------- */
  try {
    if (embeddingCache.has(query)) {
      embedding = embeddingCache.get(query)
    } else {
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      })
      embedding = res.data?.[0]?.embedding
      if (embedding) embeddingCache.set(query, embedding)
    }
  } catch (err: any) {
    console.error("EMBEDDING_FAILED", err?.message || err)
    return []
  }

  if (!embedding) return []

  /* -------- Supabase RPC -------- */
  try {
    const { data, error } = await supabase.rpc(
      "match_sensihi_documents",
      {
        query_embedding: embedding,
        match_threshold: 0.72,
        match_count: 8,
      }
    )

    if (error || !Array.isArray(data)) {
      console.error("SUPABASE_VECTOR_ERROR", error)
      return []
    }

    // Filter weak / empty rows
    return data.filter(
      (d: any) =>
        typeof d.content === "string" &&
        d.content.length > 80
    )
  } catch (err: any) {
    console.error("VECTOR_SEARCH_FAILED", err?.message || err)
    return []
  }
}
