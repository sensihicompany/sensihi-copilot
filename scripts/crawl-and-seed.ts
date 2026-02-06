/**
 * Crawl sensihi.com, extract content, chunk, embed, and upsert into Supabase.
 * ADMIN-ONLY SCRIPT — never runs in production.
 */

import "dotenv/config"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { JSDOM } from "jsdom"

/* ----------------------------------
   Config
---------------------------------- */
const BASE_URL = "https://sensihi.com"
const MAX_PAGES = 50                 // safety cap
const MIN_TEXT_LENGTH = 200
const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

/* ----------------------------------
   Clients
---------------------------------- */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/* ----------------------------------
   Crawl state
---------------------------------- */
const visited = new Set<string>()
const discovered: string[] = []

/* ----------------------------------
   Utilities
---------------------------------- */
function normalizeUrl(url: string) {
  return url.replace(/\/$/, "")
}

function isInternal(url: string) {
  return url.startsWith(BASE_URL)
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SensihiCrawler/1.0" }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`)
  }
  return res.text()
}

/* ----------------------------------
   ✅ FIXED LINK EXTRACTION (Framer-safe)
---------------------------------- */
function extractLinks(html: string, currentUrl: string): string[] {
  const dom = new JSDOM(html, { url: currentUrl })
  const anchors = Array.from(dom.window.document.querySelectorAll("a"))

  const links = anchors
    .map(a => a.getAttribute("href"))
    .filter(Boolean)
    .map(href => {
      try {
        return normalizeUrl(new URL(href!, currentUrl).toString())
      } catch {
        return null
      }
    })
    .filter(
      (url): url is string =>
        !!url &&
        isInternal(url) &&
        !url.includes("#") &&
        !url.includes("?") &&
        !url.endsWith(".pdf")
    )

  return Array.from(new Set(links))
}

/* ----------------------------------
   Text extraction
---------------------------------- */
function extractText(html: string): string {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  doc
    .querySelectorAll("script,style,nav,footer,header")
    .forEach(el => el.remove())

  return (
    doc.body.textContent
      ?.replace(/\s+/g, " ")
      .trim() || ""
  )
}

/* ----------------------------------
   Chunking
---------------------------------- */
function chunkText(text: string): string[] {
  const chunks: string[] = []
  let i = 0

  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
    i += CHUNK_SIZE - CHUNK_OVERLAP
  }

  return chunks
}

/* ----------------------------------
   Embedding
---------------------------------- */
async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000)
  })
  return res.data[0].embedding
}

/* ----------------------------------
   Crawl logic
---------------------------------- */
async function crawl(url: string) {
  if (visited.has(url)) return
  if (visited.size >= MAX_PAGES) return

  visited.add(url)
  console.log("Crawling:", url)

  let html: string
  try {
    html = await fetchHtml(url)
  } catch (err) {
    console.warn("Skip fetch:", url)
    return
  }

  discovered.push(url)

  const links = extractLinks(html, url)
  for (const link of links) {
    await crawl(link)
  }
}

/* ----------------------------------
   Main
---------------------------------- */
async function main() {
  console.log("Starting crawl at", BASE_URL)
  await crawl(normalizeUrl(BASE_URL))

  console.log(`Discovered ${discovered.length} page(s)`)

  for (const url of discovered) {
    let html: string
    try {
      html = await fetchHtml(url)
    } catch {
      continue
    }

    const text = extractText(html)
    if (!text || text.length < MIN_TEXT_LENGTH) continue

    const chunks = chunkText(text)

    for (const content of chunks) {
      try {
        const embedding = await embed(content)

        await supabase.from("sensihi_documents").upsert({
          content,
          embedding,
          metadata: { url }
        })
      } catch (err) {
        console.error("Failed to embed chunk from", url)
      }
    }
  }

  console.log("✅ Crawl + seed complete")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
