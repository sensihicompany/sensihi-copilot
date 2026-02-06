import { getSessionMemory, updateSessionMemory } from "./memory.js"
import { detectUserIntent, recommendNextAction } from "./tools.js"


/**
 * Minimal orchestrator test
 * Purpose:
 * - Verify memory import
 * - Verify runtime execution
 * - No other dependencies
 */
export async function runCopilotV2() {
  const sessionId = "debug-session"
  const message = "I want to explore AI for my business"

  const { intent } = detectUserIntent(message)

  const before = getSessionMemory(sessionId)
  updateSessionMemory(sessionId, message)
  const after = getSessionMemory(sessionId)

  return {
    ok: true,
    intent,
    memoryBefore: before.length,
    memoryAfter: after.length,
    cta: recommendNextAction(intent),
  }
}