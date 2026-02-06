export function scoreLead({
  intent,
  messageCount,
  askedForDemo
}: {
  intent: string
  messageCount: number
  askedForDemo: boolean
}) {
  let score = 0

  if (intent === "high_intent_buyer") score += 40
  if (messageCount > 3) score += 20
  if (askedForDemo) score += 30

  return {
    score,
    tier: score >= 70 ? "hot" : score >= 40 ? "warm" : "cold"
  }
}
