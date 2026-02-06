/**
 * Seed sensihi_documents with content + embeddings.
 *
 * Usage:
 *   node scripts/seed-embeddings.ts [path/to/content.json]
 *
 * Safe for one-time / occasional runs.
 * NOT used at runtime.
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve } from "path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

/* ----------------------------------
   Env validation
---------------------------------- */
const {
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
} = process.env

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars. Check .env")
  process.exit(1)
}

if (OPENAI_API_KEY.startsWith("sk-xxxx")) {
  console.error("OPENAI_API_KEY looks like a placeholder")
  process.exit(1)
}

/* ----------------------------------
   Clients (Node runtime)
---------------------------------- */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

/* ----------------------------------
   Config (tunable)
---------------------------------- */
const EMBEDDING_MODEL = "text-embedding-3-small"
const CHUNK_MAX_CHARS = 800
const CHUNK_OVERLAP = 100
const MAX_CONCURRENCY = 3 // protects quota
const DRY_RUN = false     // set true to test without inserts

/* ----------------------------------
   Types
---------------------------------- */
interface Chunk {
  content: string
  metadata?: Record<string, unknown>
}

interface SeedInput {
  chunks?: Chunk[]
  urls?: string[]
}

/* ----------------------------------
   Helpers
---------------------------------- */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SensihiCopilot-Seed/1.0" }
  })
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`)
  return stripHtml(await res.text())
}

function splitIntoChunks(text: string, metadata?: Record<string, unknown>): Chunk[] {
  const chunks: Chunk[] = []
  let current = ""

  for (const para of text.split(/\n\n+/)) {
    const p = para.trim()
    if (!p) continue

    if (current.length + p.length <= CHUNK_MAX_CHARS) {
      current += (current ? "\n\n" : "") + p
    } else {
      chunks.push({ content: current, metadata })
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + p
    }
  }

  if (current) chunks.push({ content: current, metadata })
  return chunks
}

/* ----------------------------------
   Embedding (quota-safe)
---------------------------------- */
async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000)
  })
  return res.data[0].embedding
}

/* ----------------------------------
   Main
---------------------------------- */
async function main() {
  const jsonPath = resolve(process.cwd(), process.argv[2] || "scripts/seed-content.json")
  const input = JSON.parse(readFileSync(jsonPath, "utf-8")) as SeedInput

  const chunks: Chunk[] = [...(input.chunks || [])]

  if (input.urls?.length) {
    for (const url of input.urls) {
      try {
        const text = await fetchTextFromUrl(url)
        chunks.push(...splitIntoChunks(text, { url }))
        console.log("Fetched:", url)
      } catch (err) {
        console.warn("Skip URL:", url, err)
      }
    }
  }

  if (!chunks.length) {
    console.error("No content to seed.")
    return
  }

  console.log(`Seeding ${chunks.length} chunk(s)...`)
  console.log(`Estimated embedding calls: ${chunks.length}`)
  if (DRY_RUN) {
    console.log("DRY RUN — no inserts will be made")
    return
  }

  let inserted = 0

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
    const batch = chunks.slice(i, i + MAX_CONCURRENCY)

    await Promise.all(
      batch.map(async (chunk) => {
        const content = chunk.content.trim()
        if (!content) return

        // Idempotency: skip if content already exists
        const { count } = await supabase
          .from("sensihi_documents")
          .select("*", { count: "exact", head: true })
          .eq("content", content)

        if (count && count > 0) return

        try {
          const embedding = await embed(content)
          const { error } = await supabase.from("sensihi_documents").insert({
            content,
            embedding,
            metadata: chunk.metadata ?? null
          })
          if (!error) inserted++
        } catch (err) {
          console.error("Failed chunk:", err)
        }
      })
    )

    console.log(`Progress: ${Math.min(i + MAX_CONCURRENCY, chunks.length)}/${chunks.length}`)
  }

  console.log("Done. Inserted", inserted, "new row(s).")
}

main().catch(err => {
  console.error("Fatal:", err)
  process.exit(1)
})
