/* ----------------------------------
   Intent detection
---------------------------------- */

export function detectUserIntent(message: string) {
  const m = message.toLowerCase()

  if (m.includes("demo") || m.includes("contact")) {
    return { intent: "high_intent_buyer" }
  }

  if (m.includes("pricing") || m.includes("cost")) {
    return { intent: "pricing" }
  }

  if (m.includes("insight") || m.includes("blog") || m.includes("article")) {
    return { intent: "research" }
  }

  if (m.includes("partner")) {
    return { intent: "partner" }
  }

  return { intent: "exploring" }
}

/* ----------------------------------
   CTA recommendation (MULTI)
---------------------------------- */

export function recommendNextAction(intent: string) {
  switch (intent) {
    case "high_intent_buyer":
      return [
        { label: "Contact Sensihi", url: "/contact", type: "primary" },
        { label: "Explore Solutions", url: "/solutions", type: "secondary" },
      ]

    case "research":
      return [
        { label: "Read Insights", url: "/insights", type: "primary" },
        { label: "View Case Studies", url: "/insights", type: "secondary" },
      ]

    case "pricing":
      return [
        { label: "Talk to Us", url: "/contact", type: "primary" },
      ]

    default:
      return [
        { label: "Explore Insights", url: "/insights", type: "primary" },
        { label: "Contact Us", url: "/contact", type: "secondary" },
      ]
  }
}

/* ----------------------------------
   Persona tone adjustment
---------------------------------- */

export function summarizeForPersona(content: string, persona: string) {
  if (!content) return content

  if (persona === "founder") {
    return `From a founder’s perspective:\n\n${content}`
  }

  if (persona === "technical") {
    return `From a technical standpoint:\n\n${content}`
  }

  if (persona === "sales") {
    return `From a business outcomes view:\n\n${content}`
  }

  return content
}
