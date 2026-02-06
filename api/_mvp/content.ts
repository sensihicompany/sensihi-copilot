/**
 * High-quality fallback content
 * Used ONLY when vector search returns nothing
 */

export async function getFallbackContent(query: string): Promise<string[]> {
  const q = query.toLowerCase()

  if (q.includes("sensihi")) {
    return [
      "Sensihi is an AI consultancy that helps organizations apply AI responsibly to real business workflows, improving decision-making, automation, and scalability.",
    ]
  }

  if (q.includes("prototyping")) {
    return [
      "Prototyping is the process of creating early models of AI-enabled solutions to test ideas, validate workflows, and ensure real business value before full-scale implementation.",
    ]
  }

  if (q.includes("ai")) {
    return [
      "Sensihi focuses on practical AI adoption—embedding AI into existing tools and workflows rather than deploying generic automation.",
    ]
  }

  return [
    "Sensihi helps teams adopt AI responsibly by aligning technology with real business processes and measurable outcomes.",
  ]
}
