import { vectorSearch } from "./vector"
import {
  getSessionMemory,
  updateSessionMemory,
  getLastContext,
  setLastContext
} from "./memory"
import {
  detectUserIntent,
  recommendNextAction,
  summarizeForPersona
} from "./tools"
import { scoreLead } from "./leadScore"
import { trackEvent } from "./analytics"
import { getFallbackContent } from "./content"

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

/* ----------------------------------
   Helpers
---------------------------------- */

// Static answers that require zero AI usage
function getStaticAnswer(message: string): string | null {
  const m = message.toLowerCase()

  if (m.includes("what does sensihi do")) {
    return (
      "Sensihi provides AI-driven solutions that help modern businesses " +
      "improve decision-making, automate workflows, and scale intelligence across teams."
    )
  }

  if (m.includes("contact") || m.includes("reach you")) {
    return "You can reach the Sensihi team via the contact page to start a conversation."
  }

  return null
}

// Decide when vector search is worth running
function shouldRunVectorSearch(message: string, memoryLength: number) {
  if (message.length < 15) return false        // low signal
  if (memoryLength > 0) return false           // follow-up
  return true
}

/* ----------------------------------
   Orchestrator
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
  /* ------------------------------
     1. Intent + session memory
  ------------------------------ */
  const { intent } = detectUserIntent(message)
  const memory = getSessionMemory(sessionId)

  /* ------------------------------
     2. Static short-circuit
     (0 OpenAI calls)
  ------------------------------ */
  const staticAnswer = getStaticAnswer(message)
  if (staticAnswer) {
    updateSessionMemory(sessionId, message)

    const lead = scoreLead({
      intent,
      messageCount: memory.length + 1,
      askedForDemo: false
    })

    trackEvent({ sessionId, intent, page, leadTier: lead.tier })

    return {
      message: persona
        ? summarizeForPersona(staticAnswer, persona)
        : staticAnswer,
      intent,
      lead,
      cta: recommendNextAction(intent)
    }
  }

  /* ------------------------------
     3. Resolve context
     (reuse → vector → static)
  ------------------------------ */
  let context = getLastContext(sessionId) || ""

  // Only run vector search if we don’t already have context
  if (!context && shouldRunVectorSearch(message, memory.length)) {
    try {
      const docs = await vectorSearch(message)

      if (docs.length > 0) {
        context = docs
          .map(d => d.content)
          .filter(Boolean)
          .join("\n")

        setLastContext(sessionId, context)
      }
    } catch (err) {
      console.error("VECTOR_SEARCH_FAILED", err)
    }
  }

  // Final fallback: static content
  if (!context) {
    const fallback = await getFallbackContent(message)
    context = fallback.join("\n")
  }

  // Absolute last resort
  if (!context) {
    context =
      "Sensihi provides AI-driven solutions that help modern businesses " +
      "improve decision-making, automate workflows, and scale intelligence across teams."
  }

  /* ------------------------------
     4. OpenAI completion (SAFE)
  ------------------------------ */
  let answer = ""

  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Sensihi’s website copilot. Answer clearly and only using the provided context. Do not invent details."
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

    answer = completion.choices?.[0]?.message?.content ?? ""
  } catch (err: any) {
    console.error("OPENAI_COMPLETION_FAILED", err?.code || err?.message)

    return {
      message:
        "I’m temporarily at capacity right now. Please try again in a moment.",
      intent,
      confidence: "low",
      cta: recommendNextAction(intent)
    }
  }

  /* ------------------------------
     5. Persona adaptation
  ------------------------------ */
  if (persona && answer) {
    try {
      answer = summarizeForPersona(answer, persona)
    } catch (err) {
      console.error("PERSONA_SUMMARY_FAILED", err)
    }
  }

  /* ------------------------------
     6. Update session memory
  ------------------------------ */
  updateSessionMemory(sessionId, message)

  /* ------------------------------
     7. Lead scoring
  ------------------------------ */
  const lead = scoreLead({
    intent,
    messageCount: memory.length + 1,
    askedForDemo: message.toLowerCase().includes("demo")
  })

  /* ------------------------------
     8. Analytics (fire-and-forget)
  ------------------------------ */
  trackEvent({
    sessionId,
    intent,
    page,
    leadTier: lead.tier
  })

  /* ------------------------------
     9. Final response
  ------------------------------ */
  return {
    message: answer || "How can I help you with Sensihi?",
    intent,
    lead,
    cta: recommendNextAction(intent)
  }
}
