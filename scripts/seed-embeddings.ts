/**
 * Seed sensihi_documents with content + embeddings.
 * Usage: npm run seed [path/to/content.json]
 * Default: scripts/seed-content.json (create from seed-content.example.json)
 *
 * JSON format — use one or both:
 *   "chunks": [ { "content": "text", "metadata": { "url": "...", "title": "..." } } ]
 *   "urls": [ "https://sensihi.com/page" ]  → fetched, text extracted, chunked, then embedded
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve } from "path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY")
  console.error("Copy .env.example to .env and set real values (never commit .env).")
  process.exit(1)
}
if (OPENAI_API_KEY.includes("xxxx") || OPENAI_API_KEY === "sk-xxxx") {
  console.error("OPENAI_API_KEY looks like a placeholder. Put your real OpenAI API key in .env")
  console.error("Get a key at https://platform.openai.com/api-keys")
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const EMBEDDING_MODEL = "text-embedding-3-small"
const CHUNK_MAX_CHARS = 800
const CHUNK_OVERLAP = 100

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  content: string
  metadata?: Record<string, unknown>
}

interface SeedInput {
  chunks?: Chunk[]
  urls?: string[]
}

// ---------------------------------------------------------------------------
// Fetch URL and extract plain text (strip HTML, basic)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SensihiCopilot-Seed/1.0" }
  })
  if (!res.ok) throw new Error(`Fetch ${url}: ${res.status}`)
  const html = await res.text()
  return stripHtml(html)
}

function splitIntoChunks(text: string, baseMetadata?: Record<string, unknown>): Chunk[] {
  const chunks: Chunk[] = []
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  let current = ""

  for (const p of paragraphs) {
    if (current.length + p.length + 2 <= CHUNK_MAX_CHARS) {
      current += (current ? "\n\n" : "") + p
    } else {
      if (current) {
        chunks.push({ content: current, metadata: baseMetadata })
        const start = Math.max(0, current.length - CHUNK_OVERLAP)
        current = current.slice(start) + "\n\n" + p
      } else {
        // Single paragraph longer than max
        for (let i = 0; i < p.length; i += CHUNK_MAX_CHARS - CHUNK_OVERLAP) {
          chunks.push({
            content: p.slice(i, i + CHUNK_MAX_CHARS),
            metadata: baseMetadata
          })
        }
        current = ""
      }
    }
  }
  if (current) chunks.push({ content: current, metadata: baseMetadata })
  return chunks
}

// ---------------------------------------------------------------------------
// Embed and insert
// ---------------------------------------------------------------------------

async function getEmbedding(text: string): Promise<number[]> {
  const { data } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, " ").slice(0, 8000)
  })
  return data[0].embedding
}

async function main() {
  const jsonPath = resolve(process.cwd(), process.argv[2] || "scripts/seed-content.json")
  let input: SeedInput

  try {
    const raw = readFileSync(jsonPath, "utf-8")
    input = JSON.parse(raw) as SeedInput
  } catch (e) {
    console.error("Failed to read JSON at", jsonPath)
    console.error("Copy scripts/seed-content.example.json to scripts/seed-content.json and fill it.")
    process.exit(1)
  }

  const allChunks: Chunk[] = [...(input.chunks || [])]

  if (input.urls?.length) {
    console.log("Fetching", input.urls.length, "URL(s)...")
    for (const url of input.urls) {
      try {
        const text = await fetchTextFromUrl(url)
        const urlChunks = splitIntoChunks(text, { url })
        allChunks.push(...urlChunks)
        console.log("  ", url, "→", urlChunks.length, "chunk(s)")
      } catch (err) {
        console.warn("  Skip", url, err)
      }
    }
  }

  if (allChunks.length === 0) {
    console.error("No chunks to seed. Add 'chunks' and/or 'urls' in your JSON.")
    process.exit(1)
  }

  console.log("Embedding", allChunks.length, "chunk(s)...")

  let inserted = 0
  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i]
    const content = chunk.content.trim()
    if (!content) continue

    const embedding = await getEmbedding(content)
    const { error } = await supabase.from("sensihi_documents").insert({
      content,
      embedding,
      metadata: chunk.metadata ?? null
    })

    if (error) {
      console.error("Insert error:", error.message)
      continue
    }
    inserted++
    if ((i + 1) % 10 === 0) console.log("  ", i + 1, "/", allChunks.length)
  }

  console.log("Done. Inserted", inserted, "row(s) into sensihi_documents.")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
