/**
 * Sensihi Copilot — Seed Embeddings (MANUAL / CURATED)
 * - Loads URLs or manual chunks
 * - Framer-safe content extraction
 * - Stores reference-grade metadata
 *
 * ⚠️ ADMIN SCRIPT — NEVER RUN IN PROD RUNTIME
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

const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing env vars")
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
const MIN_TEXT_LENGTH = 200

/* ----------------------------------
   Types
---------------------------------- */

type DocType = "insight" | "blog" | "case-study" | "page"

interface Chunk {
  content: string
  metadata: {
    url: string
    title: string
    type: DocType
    source: "manual"
  }
}

interface SeedInput {
  urls?: string[]
  chunks?: Chunk[]
}

/* ----------------------------------
   Helpers
---------------------------------- */

function normalizeUrl(url: string) {
  return url.replace(/\/$/, "")
}

function inferType(url: string): DocType {
  if (url.includes("/insights/")) return "insight"
  if (url.includes("/blog")) return "blog"
  if (url.includes("/case")) return "case-study"
  return "page"
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function splitChunks(
  text: string,
  metadata: Chunk["metadata"]
): Chunk[] {
  const out: Chunk[] = []
  let i = 0

  while (i < text.length) {
    out.push({
      content: text.slice(i, i + MAX_CHARS),
      metadata,
    })
    i += MAX_CHARS - OVERLAP
  }

  return out
}

/* ----------------------------------
   Fetch + extract (Framer-safe)
---------------------------------- */

async function fetchAndExtract(url: string): Promise<Chunk[]> {
  const normalized = normalizeUrl(url)

  const res = await fetch(normalized, {
    headers: { "User-Agent": "SensihiCopilotSeeder/1.0" },
  })

  if (!res.ok) throw new Error(`Failed ${normalized}`)

  const html = await res.text()
  const dom = new JSDOM(html)
  const doc = dom.window.document

  doc
    .querySelectorAll("script,style,nav,footer,header")
    .forEach(el => el.remove())

  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent ||
    "Sensihi"

  // Framer-safe extraction
  const text = cleanText(
    Array.from(doc.querySelectorAll("main, article, section"))
      .map(el => el.textContent || "")
      .join("\n\n")
  )

  if (!text || text.length < MIN_TEXT_LENGTH) return []

  return splitChunks(text, {
    url: normalized,
    title: title.trim(),
    type: inferType(normalized),
    source: "manual",
  })
}

/* ----------------------------------
   Embedding
---------------------------------- */

async function embed(text: string): Promise<number[]> {
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
    console.log(`🔍 Seeding ${input.urls.length} URLs`)
    for (const url of input.urls) {
      try {
        const extracted = await fetchAndExtract(url)
        chunks.push(...extracted)
        console.log(`✓ ${url} → ${extracted.length} chunks`)
      } catch {
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

  console.log("✅ Manual seeding complete")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
