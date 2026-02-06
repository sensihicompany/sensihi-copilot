import { vectorSearch } from "./vector"
import { getSessionMemory, updateSessionMemory } from "./memory"
import { detectUserIntent, recommendNextAction } from "./tools"
import { scoreLead } from "./leadScore"
import { trackEvent } from "./analytics"

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

type VectorDoc = {
  content?: string
  metadata?: {
    url?: string
    title?: string
    type?: string
  }
  similarity?: number
}

/* ----------------------------------
   Extract article / insight references
---------------------------------- */
function extractReferences(docs: VectorDoc[]) {
  const seen = new Set<string>()

  return docs
    .map(d => d.metadata)
    .filter(
      m =>
        m?.url &&
        m?.title &&
        !seen.has(m.url) &&
        seen.add(m.url)
    )
    .slice(0, 4)
    .map(m => ({
      title: m!.title!,
      url: m!.url!
    }))
}

/* ----------------------------------
   Build LLM context
---------------------------------- */
function buildContext(docs: VectorDoc[]) {
  const chunks = docs
    .map(d => d.content)
    .filter(Boolean)

  if (chunks.length === 0) {
    return `
Sensihi helps organizations apply AI responsibly and effectively
to real business workflows, improving decision-making, automating
processes, and scaling intelligence across teams.
`
  }

  return chunks.join("\n\n")
}

/* ----------------------------------
   Main Copilot Orchestrator
---------------------------------- */
export async function runCopilotV2({
  message,
  page,
  persona,
  sessionId,
  aiClient
}: {
  message: string
  page?: string
  persona?: string
  sessionId: string
  aiClient: AIClient
}) {
  /* -------- 1. Intent + memory -------- */
  const { intent } = detectUserIntent(message)
  const memory = getSessionMemory(sessionId)

  /* -------- 2. Vector search -------- */
  let docs: VectorDoc[] = []

  try {
    docs = await vectorSearch(message)
  } catch (err) {
    console.error("VECTOR_SEARCH_FAILED", err)
    docs = []
  }

  /* -------- 3. Context + references -------- */
  const context = buildContext(docs)
  const references = extractReferences(docs)

  /* -------- 4. OpenAI completion -------- */
  let answer = ""

  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Sensihi’s website copilot.

Your role:
- Help visitors understand Sensihi’s offerings, insights, and expertise.
- Use Sensihi articles, blogs, and case studies as grounding when available.

Rules:
- If a question is general (e.g., “What is prototyping?”), explain it briefly in plain language.
- Then relate the concept back to how Sensihi applies or thinks about it.
- NEVER say “not in the provided context” or similar phrases.
- Do not invent facts about Sensihi.
- Prefer practical, business-focused explanations over theory.
- Keep answers concise but helpful.

Tone:
- Clear
- Confident
- Professional
- Not academic
`
        },
        ...memory.map(m => ({
          role: "user" as const,
          content: m
        })),
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion:\n${message}`
        }
      ]
    })

    answer =
      completion.choices?.[0]?.message?.content ??
      "How can I help you with Sensihi?"
  } catch (err: any) {
    console.error("OPENAI_COMPLETION_FAILED", err?.code || err?.message)

    return {
      message:
        "I’m temporarily at capacity right now. Please try again in a moment.",
      intent,
      confidence: "low",
      cta: recommendNextAction(intent),
      references
    }
  }

  /* -------- 5. Update session memory -------- */
  try {
    updateSessionMemory(sessionId, message)
  } catch (err) {
    console.error("SESSION_MEMORY_UPDATE_FAILED", err)
  }

  /* -------- 6. Lead scoring -------- */
  let lead

  try {
    lead = scoreLead({
      intent,
      messageCount: memory.length + 1,
      askedForDemo: message.toLowerCase().includes("demo")
    })
  } catch {
    lead = { score: 0, tier: "cold" }
  }

  /* -------- 7. Analytics (non-blocking) -------- */
  try {
    await trackEvent({
      sessionId,
      intent,
      page,
      leadTier: lead.tier
    })
  } catch {
    /* ignore */
  }

  /* -------- 8. Final response -------- */
  return {
    message: answer,
    intent,
    lead,
    cta: recommendNextAction(intent),
    references
  }
}
