/* ----------------------------------
   Types
---------------------------------- */
type CopilotEvent = {
  type?: string
  sessionId?: string
  intent?: string
  page?: string
  leadTier?: string
  timestamp?: number
  [key: string]: unknown
}

/* ----------------------------------
   Config
---------------------------------- */
const ENABLE_ANALYTICS = true

/* ----------------------------------
   Analytics queue (in-memory)
   Prevents blocking user flow
---------------------------------- */
const eventQueue: CopilotEvent[] = []
const MAX_QUEUE_SIZE = 50

/* ----------------------------------
   Public API
---------------------------------- */
export function trackEvent(event: CopilotEvent) {
  if (!ENABLE_ANALYTICS) return

  try {
    const enrichedEvent: CopilotEvent = {
      ...event,
      timestamp: Date.now()
    }

    eventQueue.push(enrichedEvent)

    // Prevent unbounded growth
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      eventQueue.shift()
    }

    // For now: console log (Edge-safe)
    console.log("[COPILOT_EVENT]", enrichedEvent)
  } catch (err) {
    // Analytics must NEVER crash Copilot
    console.error("ANALYTICS_ERROR", err)
  }
}

/* ----------------------------------
   Optional: batch flush hook
   (future PostHog / Segment)
---------------------------------- */
export async function flushEvents(
  flushFn?: (events: CopilotEvent[]) => Promise<void>
) {
  if (!flushFn || eventQueue.length === 0) return

  const batch = eventQueue.splice(0, eventQueue.length)

  try {
    await flushFn(batch)
  } catch (err) {
    console.error("ANALYTICS_FLUSH_FAILED", err)
  }
}
