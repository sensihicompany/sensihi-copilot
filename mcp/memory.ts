const sessions = new Map<string, string[]>()

export function getSessionMemory(sessionId: string) {
  return sessions.get(sessionId) || []
}

export function updateSessionMemory(sessionId: string, message: string) {
  const history = sessions.get(sessionId) || []
  history.push(message)
  sessions.set(sessionId, history.slice(-6))
}
