/**
 * Sensihi Copilot — Crawl & Seed (STABLE)
 * Crawls sensihi.com + /insights,
 * extracts readable content,
 * chunks, embeds, and stores in Supabase.
 *
 * ⚠️ ADMIN SCRIPT — NEVER RUN IN PROD RUNTIME
 */

import "dotenv/config"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { JSDOM } from "jsdom"

/* ----------------------------------
   Environment
---------------------------------- */

const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing environment variables")
  process.exit(1)
}

/* ----------------------------------
   Config
---------------------------------- */

const BASE_URL = "https://sensihi.com"
const INSIGHTS_URL = "https://sensihi.com/insights"

const MAX_PAGES = 80
const MIN_TEXT_LENGTH = 250

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 120

const EMBEDDING_MODEL = "text-embedding-3-small"

/* ----------------------------------
   Clients
---------------------------------- */

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

function inferType(url: string): "insight" | "blog" | "case-study" | "page" {
  if (url.includes("/insights/")) return "insight"
  if (url.includes("/blog")) return "blog"
  if (url.includes("/case")) return "case-study"
  return "page"
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SensihiCrawler/1.0" },
  })

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}`)
  }

  return res.text()
}

/* ----------------------------------
   Link extraction (Framer-safe)
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
   Content extraction (Framer-aware)
---------------------------------- */

function extractContent(html: string) {
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

  // Framer-safe: grab readable blocks
  const blocks = Array.from(
    doc.querySelectorAll("main, article, section")
  )
    .map(el => el.textContent || "")
    .join("\n\n")
    .replace(/\s+/g, " ")
    .trim()

  return {
    title: title.trim(),
    text: blocks,
  }
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
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
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
  console.log("🔍 Crawling:", url)

  let html: string
  try {
    html = await fetchHtml(url)
  } catch {
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
  console.log("🚀 Starting crawl")

  // 🔒 Seed known important roots
  await crawl(normalizeUrl(BASE_URL))
  await crawl(normalizeUrl(INSIGHTS_URL))

  console.log(`📄 Discovered ${discovered.length} pages`)

  for (const url of discovered) {
    let html: string
    try {
      html = await fetchHtml(url)
    } catch {
      continue
    }

    const { title, text } = extractContent(html)
    if (!text || text.length < MIN_TEXT_LENGTH) continue

    const chunks = chunkText(text)
    const type = inferType(url)

    for (const content of chunks) {
      try {
        const embedding = await embed(content)

        await supabase.from("sensihi_documents").insert({
          content,
          embedding,
          metadata: {
            url,
            title,
            type,
            source: "crawl",
          },
        })
      } catch (err) {
        console.error("❌ Embed failed:", url)
      }
    }
  }

  console.log("✅ Crawl & seed complete")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
