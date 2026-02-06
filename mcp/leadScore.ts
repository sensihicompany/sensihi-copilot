/* ----------------------------------
   Types
---------------------------------- */
export type LeadTier = "cold" | "warm" | "hot"

type LeadScoreInput = {
  intent: string
  messageCount: number
  askedForDemo: boolean
}

type LeadScoreResult = {
  score: number
  tier: LeadTier
  signals: string[]
}

/* ----------------------------------
   Scoring constants (tunable)
---------------------------------- */
const SCORES = {
  HIGH_INTENT_INTENT: 40,
  MULTI_MESSAGE_ENGAGEMENT: 20,
  EXPLICIT_DEMO_REQUEST: 30
}

const THRESHOLDS = {
  HOT: 70,
  WARM: 40
}

/* ----------------------------------
   Lead scoring (deterministic)
---------------------------------- */
export function scoreLead({
  intent,
  messageCount,
  askedForDemo
}: LeadScoreInput): LeadScoreResult {
  let score = 0
  const signals: string[] = []

  // Buying intent signal
  if (intent === "high_intent_buyer") {
    score += SCORES.HIGH_INTENT_INTENT
    signals.push("high_intent_language")
  }

  // Engagement depth signal
  if (messageCount > 3) {
    score += SCORES.MULTI_MESSAGE_ENGAGEMENT
    signals.push("multi_message_engagement")
  }

  // Explicit demo / sales request
  if (askedForDemo) {
    score += SCORES.EXPLICIT_DEMO_REQUEST
    signals.push("explicit_demo_request")
  }

  // Tier classification
  let tier: LeadTier = "cold"
  if (score >= THRESHOLDS.HOT) {
    tier = "hot"
  } else if (score >= THRESHOLDS.WARM) {
    tier = "warm"
  }

  return {
    score,
    tier,
    signals
  }
}
