import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function vectorSearch(query: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  })

  const { data } = await supabase.rpc("match_sensihi_documents", {
    query_embedding: embedding.data[0].embedding,
    match_threshold: 0.75,
    match_count: 5
  })

  return data || []
}
