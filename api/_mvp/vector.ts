import OpenAI from "openai"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

/* ----------------------------------
   Lazy clients (SAFE)
---------------------------------- */

let openai: OpenAI | null = null
let supabase: SupabaseClient | null = null

function getOpenAI() {
  if (!openai) {
    const key = process.env.OPENAI_API_KEY
    if (!key) {
      throw new Error("OPENAI_API_KEY missing")
    }
    openai = new OpenAI({ apiKey: key })
  }
  return openai
}

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error("Supabase env vars missing")
  }

  if (!supabase) {
    supabase = createClient(url, key)
  }

  return supabase
}

/* ----------------------------------
   In-memory embedding cache (bounded)
---------------------------------- */

const embeddingCache = new Map<string, number[]>()
const MAX_CACHE_SIZE = 100

function cacheEmbedding(query: string, embedding: number[]) {
  embeddingCache.set(query, embedding)
  if (embeddingCache.size > MAX_CACHE_SIZE) {
    const firstKey = embeddingCache.keys().next().value
    embeddingCache.delete(firstKey)
  }
}

/* ----------------------------------
   Heuristic
---------------------------------- */

function shouldEmbed(query: string) {
  return !!query && query.length >= 12
}

/* ----------------------------------
   Vector search
---------------------------------- */

export async function vectorSearch(query: string) {
  if (!shouldEmbed(query)) return []

  let embedding: number[] | undefined

  /* -------- Embedding -------- */
  try {
    if (embeddingCache.has(query)) {
      embedding = embeddingCache.get(query)
    } else {
      const res = await getOpenAI().embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      })
      embedding = res.data?.[0]?.embedding
      if (embedding) cacheEmbedding(query, embedding)
    }
  } catch (err: any) {
    console.error("EMBEDDING_FAILED", err?.message || err)
    return []
  }

  if (!embedding) return []

  /* -------- Supabase RPC -------- */
  try {
    const { data, error } = await getSupabase().rpc(
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
