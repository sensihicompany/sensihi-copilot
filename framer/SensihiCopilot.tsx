/**
 * Sensihi Website Copilot — Framer Code Component
 * Paste into Framer → Code Component
 * Floating launcher, persona switch, CTA rendering, session ID, MCP payload
 */

import React, { useState, useCallback, useRef, useEffect } from "react"

const COPILOT_API = "https://sensihi-copilot.vercel.app/api/copilot"

function generateSessionId() {
  return "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type Persona = "default" | "founder" | "sales" | "technical"

interface CopilotResponse {
  message: string
  intent?: string
  lead?: { score: number; tier: string }
  cta?: { label: string; url: string }
  confidence?: string
}

export function SensihiCopilot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [persona, setPersona] = useState<Persona>("default")
  const [cta, setCta] = useState<{ label: string; url: string } | null>(null)
  const sessionIdRef = useRef<string>(generateSessionId())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setMessages(prev => [...prev, { role: "user", content: text }])
    setLoading(true)
    setCta(null)

    try {
      const res = await fetch(COPILOT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          page: typeof window !== "undefined" ? window.location.pathname : "/",
          persona: persona === "default" ? undefined : persona,
          sessionId: sessionIdRef.current
        })
      })

      if (!res.ok) {
        throw new Error(res.statusText)
      }

      const data: CopilotResponse = await res.json()
      setMessages(prev => [...prev, { role: "assistant", content: data.message }])
      if (data.cta) setCta(data.cta)
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn’t reach the copilot. Please try again." }
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, persona])

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "none",
          background: "#111",
          color: "#fff",
          fontSize: 24,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          zIndex: 9998
        }}
        aria-label="Open copilot"
      >
        {open ? "✕" : "◆"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 90,
            right: 24,
            width: 380,
            maxWidth: "calc(100vw - 48px)",
            height: 520,
            maxHeight: "calc(100vh - 120px)",
            borderRadius: 16,
            background: "#fff",
            boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden"
          }}
        >
          <div style={{ padding: 16, borderBottom: "1px solid #eee", background: "#fafafa" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sensihi Copilot</div>
            {/* Persona switch */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["default", "founder", "sales", "technical"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPersona(p)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: persona === p ? "2px solid #111" : "1px solid #ddd",
                    background: persona === p ? "#111" : "#fff",
                    color: persona === p ? "#fff" : "#333",
                    fontSize: 12,
                    cursor: "pointer",
                    textTransform: "capitalize"
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: "#888", fontSize: 14 }}>
                Ask about Sensihi — solutions, demos, or partnerships.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: m.role === "user" ? "#111" : "#f0f0f0",
                  color: m.role === "user" ? "#fff" : "#222",
                  fontSize: 14
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", padding: "10px 14px", color: "#666", fontSize: 14 }}>
                …
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* CTA */}
          {cta && (
            <div style={{ padding: "8px 16px", borderTop: "1px solid #eee" }}>
              <a
                href={cta.url}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#111",
                  color: "#fff",
                  textAlign: "center",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                {cta.label}
              </a>
            </div>
          )}

          <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask anything…”
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14
              }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SensihiCopilot
