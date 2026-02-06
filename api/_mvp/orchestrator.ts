import { getSessionMemory, updateSessionMemory } from "./memory.js"

/**
 * Minimal orchestrator test
 * Purpose:
 * - Verify memory import
 * - Verify runtime execution
 * - No other dependencies
 */
export async function runCopilotV2() {
  const sessionId = "debug-session"

  const before = getSessionMemory(sessionId)
  updateSessionMemory(sessionId, "hello")
  const after = getSessionMemory(sessionId)

  return {
    ok: true,
    memoryBefore: before.length,
    memoryAfter: after.length,
  }
}
