/* ----------------------------------
   Intent Detection
---------------------------------- */
export function detectUserIntent(message: string) {
  const m = message.toLowerCase()

  if (
    m.includes("demo") ||
    m.includes("pricing") ||
    m.includes("contact") ||
    m.includes("talk to") ||
    m.includes("sales")
  ) {
    return { intent: "high_intent_buyer" }
  }

  if (m.includes("partner") || m.includes("collaborate")) {
    return { intent: "partner" }
  }

  if (m.includes("career") || m.includes("job") || m.includes("hiring")) {
    return { intent: "talent" }
  }

  return { intent: "exploring" }
}

/* ----------------------------------
   CTA Recommendation (MULTI)
---------------------------------- */
export function recommendNextAction(intent: string) {
  switch (intent) {
    case "high_intent_buyer":
      return [
        {
          label: "Contact us",
          url: "/contact",
        },
        {
          label: "View solutions",
          url: "/solutions",
        },
      ]

    case "partner":
      return [
        {
          label: "Partner with Sensihi",
          url: "/contact",
        },
        {
          label: "Read insights",
          url: "/insights",
        },
      ]

    case "talent":
      return [
        {
          label: "Explore careers",
          url: "/careers",
        },
      ]

    case "exploring":
    default:
      return [
        {
          label: "Read insights",
          url: "/insights",
        },
        {
          label: "Explore solutions",
          url: "/solutions",
        },
      ]
  }
}
