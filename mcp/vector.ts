import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

/* ----------------------------------
   Clients (Edge-safe)
---------------------------------- */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/* ----------------------------------
   Simple in-memory embedding cache
   (Replace with KV / Redis later)
---------------------------------- */
const embeddingCache = new Map<string, number[]>()

/* ----------------------------------
   Heuristic: should we even embed?
---------------------------------- */
function shouldEmbed(query: string) {
  if (!query) return false
  if (query.length < 15) return false // short / low-signal
  return true
}

/* ----------------------------------
   Vector search (SAFE + CHEAP)
---------------------------------- */
export async function vectorSearch(query: string) {
  if (!shouldEmbed(query)) {
    return []
  }

  let embedding: number[] | undefined

  /* -------- Embedding (cached) -------- */
  try {
    if (embeddingCache.has(query)) {
      embedding = embeddingCache.get(query)
    } else {
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query
      })

      embedding = res.data?.[0]?.embedding
      if (embedding) {
        embeddingCache.set(query, embedding)
      }
    }
  } catch (err: any) {
    console.error(
      "EMBEDDING_FAILED",
      err?.code || err?.message || err
    )
    return [] // 👈 graceful fallback
  }

  if (!embedding) return []

  /* -------- Supabase vector search -------- */
  try {
    const { data, error } = await supabase.rpc(
      "match_sensihi_documents",
      {
        query_embedding: embedding,
        match_threshold: 0.75,
        match_count: 5
      }
    )

    if (error) {
      console.error("SUPABASE_VECTOR_ERROR", error)
      return []
    }

    return Array.isArray(data) ? data : []
  } catch (err: any) {
    console.error(
      "VECTOR_SEARCH_FAILED",
      err?.message || err
    )
    return [] // 👈 never crash
  }
}
