import { vectorSearch } from "./vector.js"
import { getSessionMemory, updateSessionMemory } from "./memory.js"
import { detectUserIntent, recommendNextAction } from "./tools.js"
import { scoreLead } from "./leadScore.js"
import { trackEvent } from "./analytics.js"

/* ----------------------------------
   Types
---------------------------------- */

type AIClient = {
  chat: {
    completions: {
      create: (opts: any) => Promise<{
        choices: Array<{ message: { content: string | null } }>
      }>
    }
  }
}

type Reference = {
  title: string
  url: string
}

/* ----------------------------------
   Constants
---------------------------------- */

const SITE_ORIGIN = "https://sensihi.com"

/* ----------------------------------
   Helpers
---------------------------------- */

function normalizeUrl(url?: string): string | null {
  if (!url) return null

  if (url.startsWith("http")) {
    return url.startsWith(SITE_ORIGIN) ? url : null
  }

  if (url.startsWith("/")) {
    return `${SITE_ORIGIN}${url}`
  }

  return null
}

function extractReferences(
  docs: Array<{ metadata?: any }>
): Reference[] {
  const seen = new Set<string>()
  const refs: Reference[] = []

  for (const d of docs) {
    const meta = d.metadata || {}
    const rawUrl = meta.url || meta.href
    const url = normalizeUrl(rawUrl)

    if (!url || seen.has(url)) continue

    seen.add(url)
    refs.push({
      title:
        meta.title ||
        meta.heading ||
        "Related Sensihi insight",
      url,
    })
  }

  return refs.slice(0, 5)
}

function formatAnswer(text: string): string {
  if (!text) return ""

  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/•\s?/g, "• ")
    .trim()
}

/* ----------------------------------
   Orchestrator
---------------------------------- */

export async function runCopilotV2({
  message,
  page,
  persona,
  sessionId,
  aiClient,
}: {
  message: string
  page?: string
  persona?: string
  sessionId: string
  aiClient: AIClient
}) {
  /* ------------------------------
     1. Intent + memory
  ------------------------------ */

  const { intent } = detectUserIntent(message)
  const memory = getSessionMemory(sessionId)

  /* ------------------------------
     2. Vector search
  ------------------------------ */

  let docs: Array<{ content?: string; metadata?: any }> = []

  try {
    docs = await vectorSearch(message)
  } catch (err) {
    console.error("VECTOR_SEARCH_FAILED", err)
  }

  /* ------------------------------
     3. Context + references
  ------------------------------ */

  const context = docs
    .map((d) => d.content)
    .filter(Boolean)
    .join("\n\n")

  const references = extractReferences(docs)

  if (!context) {
    updateSessionMemory(sessionId, message)

    return {
      message:
        "I don’t have relevant Sensihi information for that yet. Try asking about our solutions, insights, or working with Sensihi.",
      intent,
      references: [],
      cta: recommendNextAction(intent),
    }
  }

  /* ------------------------------
     4. LLM completion
  ------------------------------ */

  let answer = ""

  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Sensihi Copilot.

Rules:
- Answer ONLY using the provided information.
- Do NOT invent facts or external knowledge.
- Write clearly, with paragraphs.
- Explain things in a practical business context.
- Do NOT mention internal mechanics.
`,
        },
        ...memory.map((m) => ({
          role: "user" as const,
          content: m,
        })),
        {
          role: "user",
          content: `Question:\n${message}\n\nInformation:\n${context}`,
        },
      ],
    })

    answer =
      completion.choices?.[0]?.message?.content ?? ""
  } catch (err) {
    console.error("OPENAI_FAILED", err)

    updateSessionMemory(sessionId, message)

    return {
      message:
        "I’m temporarily unavailable. Please try again in a moment.",
      intent,
      references: [],
      cta: recommendNextAction(intent),
    }
  }

  answer = formatAnswer(answer)

  /* ------------------------------
     5. Memory update
  ------------------------------ */

  updateSessionMemory(sessionId, message)

  /* ------------------------------
     6. Lead scoring + analytics
  ------------------------------ */

  let lead = { score: 0, tier: "cold" }

  try {
    lead = scoreLead({
      intent,
      messageCount: memory.length + 1,
      askedForDemo: message.toLowerCase().includes("demo"),
    })
  } catch (err) {
    console.error("LEAD_SCORE_FAILED", err)
  }

  try {
    trackEvent({
      sessionId,
      intent,
      page,
      leadTier: lead.tier,
      references: references.length,
    })
  } catch (err) {
    console.error("ANALYTICS_FAILED", err)
  }

  /* ------------------------------
     7. Final response
  ------------------------------ */

  return {
    message: answer,
    intent,
    references,
    lead,
    cta: recommendNextAction(intent),
  }
}
