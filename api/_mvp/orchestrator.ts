import { vectorSearch } from "./vector.js"
import {
  getSessionMemory,
  updateSessionMemory,
  getLastContext,
  setLastContext,
} from "./memory.js"
import {
  detectUserIntent,
  recommendNextActions,
  summarizeForPersona,
} from "./tools.js"
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
const MAX_REFERENCES = 5

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
    const url = normalizeUrl(meta.url || meta.href)
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

  return refs.slice(0, MAX_REFERENCES)
}

function formatAnswer(text: string): string {
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
  const previousContext = getLastContext(sessionId)

  /* ------------------------------
     2. Vector search
  ------------------------------ */

  let docs: Array<{ content?: string; metadata?: any }> = []

  try {
    docs = await vectorSearch(message)
  } catch {
    // Vector failures should never block Copilot
    docs = []
  }

  /* ------------------------------
     3. Context resolution
     (new results OR memory fallback)
  ------------------------------ */

  const context =
    docs
      .map((d) => d.content)
      .filter(Boolean)
      .join("\n\n") || previousContext || ""

  if (!context) {
    updateSessionMemory(sessionId, message)

    return {
      message:
        "I don’t have relevant Sensihi information for that yet. Try asking about our solutions, insights, or working with Sensihi.",
      intent,
      references: [],
      lead: scoreLead({
        intent,
        messageCount: memory.length + 1,
        askedForDemo: message.toLowerCase().includes("demo"),
      }),
      cta: recommendNextActions(intent),
    }
  }

  setLastContext(sessionId, context)

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
- Do NOT invent facts.
- Write clearly with short paragraphs.
- Use practical, business-friendly language.
- Do NOT mention internal sources or system behavior.
`,
        },
        ...memory.map((m) => ({
          role: "user" as const,
          content: m,
        })),
        {
          role: "user",
          content: context
            ? `Information:\n${context}\n\nQuestion:\n${message}`
            : message,
        },
      ],
    })

    answer =
      completion.choices?.[0]?.message?.content ?? ""
  } catch {
    return {
      message:
        "I’m temporarily unavailable. Please try again shortly.",
      intent,
      references: [],
      cta: recommendNextActions(intent),
    }
  }

  answer = summarizeForPersona(
    formatAnswer(answer),
    persona || ""
  )

  /* ------------------------------
     5. Memory + analytics
  ------------------------------ */

  updateSessionMemory(sessionId, message)

  const lead = scoreLead({
    intent,
    messageCount: memory.length + 1,
    askedForDemo: message.toLowerCase().includes("demo"),
  })

  trackEvent({
    type: "copilot_response",
    sessionId,
    intent,
    page,
    leadTier: lead.tier,
    references: docs.length,
  })

  /* ------------------------------
     6. Final response
  ------------------------------ */

  return {
    message: answer,
    intent,
    references: extractReferences(docs),
    lead,
    cta: recommendNextActions(intent),
  }
}
