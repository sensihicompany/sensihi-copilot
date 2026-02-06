/**
 * Static fallback content for Sensihi Copilot.
 * Used when vector search or OpenAI is unavailable.
 * ZERO cost, ZERO network calls.
 */

const STATIC_CONTENT: string[] = [
  "Sensihi provides AI-driven solutions that help modern businesses improve decision-making, automate workflows, and scale intelligence across teams.",
  "Sensihi focuses on applying AI to real business workflows rather than generic automation.",
  "Sensihi works with organizations looking to adopt AI responsibly and effectively."
]

export async function getFallbackContent(query: string): Promise<string[]> {
  if (!query) return STATIC_CONTENT

  const q = query.toLowerCase()

  // Very lightweight relevance filter
  return STATIC_CONTENT.filter(
    text =>
      q.includes("sensihi") ||
      q.includes("ai") ||
      q.includes("automation") ||
      q.includes("business")
  )
}
