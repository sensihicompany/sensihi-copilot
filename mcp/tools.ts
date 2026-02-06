/* ----------------------------------
   Types
---------------------------------- */
export type UserIntent =
  | "exploring"
  | "evaluating"
  | "high_intent_buyer"
  | "partner"
  | "support"

type IntentResult = {
  intent: UserIntent
  confidence: "low" | "medium" | "high"
}

/* ----------------------------------
   Intent detection (deterministic)
---------------------------------- */
export function detectUserIntent(message: string): IntentResult {
  const m = message.toLowerCase()

  // Strong commercial signals
  if (
    m.includes("demo") ||
    m.includes("pricing") ||
    m.includes("cost") ||
    m.includes("book a call") ||
    m.includes("talk to sales")
  ) {
    return { intent: "high_intent_buyer", confidence: "high" }
  }

  // Partnership / integration
  if (
    m.includes("partner") ||
    m.includes("integration") ||
    m.includes("collaborate")
  ) {
    return { intent: "partner", confidence: "medium" }
  }

  // Support / help signals
  if (
    m.includes("help") ||
    m.includes("support") ||
    m.includes("issue") ||
    m.includes("problem")
  ) {
    return { intent: "support", confidence: "medium" }
  }

  // Evaluation phase
  if (
    m.includes("how does") ||
    m.includes("use case") ||
    m.includes("is this for") ||
    m.includes("compare")
  ) {
    return { intent: "evaluating", confidence: "medium" }
  }

  // Default: learning / browsing
  return { intent: "exploring", confidence: "low" }
}

/* ----------------------------------
   CTA recommendation (conversion-safe)
---------------------------------- */
export function recommendNextAction(intent: UserIntent) {
  switch (intent) {
    case "high_intent_buyer":
      return {
        label: "Book a demo",
        url: "/contact",
        reason: "User shows clear buying intent"
      }

    case "partner":
      return {
        label: "Discuss partnership",
        url: "/contact",
        reason: "User is exploring collaboration"
      }

    case "support":
      return {
        label: "Get help",
        url: "/contact",
        reason: "User needs assistance"
      }

    case "evaluating":
      return {
        label: "Explore use cases",
        url: "/solutions",
        reason: "User is evaluating fit"
      }

    case "exploring":
    default:
      return {
        label: "Explore solutions",
        url: "/solutions",
        reason: "User is learning about Sensihi"
      }
  }
}

/* ----------------------------------
   Persona adaptation (safe & light)
---------------------------------- */
export function summarizeForPersona(
  content: string,
  persona: string
): string {
  if (!content) return ""

  switch (persona) {
    case "founder":
      return (
        "From a leadership perspective: " +
        content
      )

    case "technical":
      return (
        "From a technical standpoint: " +
        content
      )

    case "product":
      return (
        "From a product perspective: " +
        content
      )

    case "sales":
      return (
        "From a customer value perspective: " +
        content
      )

    default:
      return content
  }
}
