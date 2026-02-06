/* ----------------------------------
   Types
---------------------------------- */
type SessionData = {
  messages: string[]
  lastContext?: string
  updatedAt: number
}

/* ----------------------------------
   In-memory store (Edge-safe)
   Replace with KV / Redis later
---------------------------------- */
const sessions = new Map<string, SessionData>()

/* ----------------------------------
   Constants
---------------------------------- */
const MAX_MESSAGES = 6
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

/* ----------------------------------
   Helpers
---------------------------------- */
function isExpired(session: SessionData) {
  return Date.now() - session.updatedAt > SESSION_TTL_MS
}

/* ----------------------------------
   Public API
---------------------------------- */

// Get only message history (what LLM needs)
export function getSessionMemory(sessionId: string): string[] {
  const session = sessions.get(sessionId)

  if (!session) return []

  if (isExpired(session)) {
    sessions.delete(sessionId)
    return []
  }

  return session.messages
}

// Store a new user message
export function updateSessionMemory(sessionId: string, message: string) {
  if (!message) return

  const session = sessions.get(sessionId)

  const messages = session?.messages || []
  messages.push(message)

  sessions.set(sessionId, {
    messages: messages.slice(-MAX_MESSAGES),
    lastContext: session?.lastContext,
    updatedAt: Date.now()
  })
}

// Store the last semantic context (vector result)
export function setLastContext(sessionId: string, context: string) {
  if (!context) return

  const session = sessions.get(sessionId)

  sessions.set(sessionId, {
    messages: session?.messages || [],
    lastContext: context,
    updatedAt: Date.now()
  })
}

// Retrieve last context for follow-up questions
export function getLastContext(sessionId: string): string | undefined {
  const session = sessions.get(sessionId)

  if (!session) return undefined

  if (isExpired(session)) {
    sessions.delete(sessionId)
    return undefined
  }

  return session.lastContext
}

// Optional: manual cleanup hook (future cron / warmup)
export function cleanupSessions() {
  const now = Date.now()

  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id)
    }
  }
}
