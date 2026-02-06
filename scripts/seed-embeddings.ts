/**
 * Sensihi Copilot — Seed Embeddings
 * - Crawls URLs or loads manual chunks
 * - Extracts title + content
 * - Stores reference-grade metadata for citations
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve } from "path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { JSDOM } from "jsdom"

/* ----------------------------------
   Env validation
---------------------------------- */

const {
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
} = process.env

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing env vars. Check .env")
  process.exit(1)
}

/* ----------------------------------
   Clients
---------------------------------- */

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

/* ----------------------------------
   Config
---------------------------------- */

const EMBEDDING_MODEL = "text-embedding-3-small"
const MAX_CHARS = 800
const OVERLAP = 120

/* ----------------------------------
   Types
---------------------------------- */

interface Chunk {
  content: string
  metadata: {
    url: string
    title: string
    type: "insight" | "blog" | "case-study" | "page"
  }
}

interface SeedInput {
  urls?: string[]
  chunks?: Chunk[]
}

/* ----------------------------------
   Helpers
---------------------------------- */

function cleanText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim()
}

function splitChunks(
  text: string,
  baseMeta: Chunk["metadata"]
): Chunk[] {
  const out: Chunk[] = []
  let cursor = 0

  while (cursor < text.length) {
    out.push({
      content: text.slice(cursor, cursor + MAX_CHARS),
      metadata: baseMeta,
    })
    cursor += MAX_CHARS - OVERLAP
  }

  return out
}

function inferType(url: string): Chunk["metadata"]["type"] {
  if (url.includes("/insights/")) return "insight"
  if (url.includes("/blog")) return "blog"
  if (url.includes("/case")) return "case-study"
  return "page"
}

/* ----------------------------------
   Fetch + extract
---------------------------------- */

async function fetchAndExtract(url: string): Promise<Chunk[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SensihiCopilotBot/1.0" },
  })

  if (!res.ok) throw new Error(`Failed ${url}`)

  const html = await res.text()
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent ||
    "Sensihi Insight"

  const paragraphs = Array.from(
    doc.querySelectorAll("main p, article p")
  )
    .map((p) => p.textContent || "")
    .join("\n\n")

  const text = cleanText(paragraphs)

  if (!text || text.length < 200) return []

  return splitChunks(text, {
    url,
    title: title.trim(),
    type: inferType(url),
  })
}

/* ----------------------------------
   Embedding
---------------------------------- */

async function embed(text: string) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  })
  return res.data[0].embedding
}

/* ----------------------------------
   Main
---------------------------------- */

async function main() {
  const inputPath = resolve(
    process.cwd(),
    process.argv[2] || "scripts/seed-content.json"
  )

  const input: SeedInput = JSON.parse(
    readFileSync(inputPath, "utf-8")
  )

  let chunks: Chunk[] = []

  if (input.urls?.length) {
    console.log(`🔍 Crawling ${input.urls.length} URLs`)
    for (const url of input.urls) {
      try {
        const extracted = await fetchAndExtract(url)
        chunks.push(...extracted)
        console.log(`✓ ${url} → ${extracted.length} chunks`)
      } catch (err) {
        console.warn(`⚠️ Skip ${url}`)
      }
    }
  }

  if (input.chunks?.length) {
    chunks.push(...input.chunks)
  }

  if (!chunks.length) {
    console.error("❌ No content to seed")
    process.exit(1)
  }

  console.log(`🧠 Embedding ${chunks.length} chunks`)

  for (const chunk of chunks) {
    const embedding = await embed(chunk.content)

    await supabase.from("sensihi_documents").insert({
      content: chunk.content,
      embedding,
      metadata: chunk.metadata,
    })
  }

  console.log("✅ Seeding complete")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
