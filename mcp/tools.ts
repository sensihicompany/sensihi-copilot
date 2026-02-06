export function detectUserIntent(message: string) {
  const m = message.toLowerCase()

  if (m.includes("demo") || m.includes("pricing")) {
    return { intent: "high_intent_buyer" }
  }

  if (m.includes("partner")) {
    return { intent: "partner" }
  }

  return { intent: "exploring" }
}

export function recommendNextAction(intent: string) {
  if (intent === "high_intent_buyer") {
    return { label: "Book a demo", url: "/contact" }
  }

  return { label: "Explore solutions", url: "/solutions" }
}

export function summarizeForPersona(content: string, persona: string) {
  if (persona === "founder") return `Founder view: ${content}`
  if (persona === "technical") return `Technical view: ${content}`
  return content
}
