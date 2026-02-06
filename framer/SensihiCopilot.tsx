/**
 * Sensihi Copilot — Premium Framer Component
 * Ask-McKinsey inspired UX
 */

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

type Message = {
  role: "user" | "assistant"
  content: string
}

type CTA = { label: string; url: string }
type Reference = { title: string; url: string }

type CopilotResponse = {
  message: string
  cta?: CTA[]
  references?: Reference[]
}

const SUGGESTED_QUESTIONS = [
  "How can Sensihi help my startup?",
  "What AI solutions does Sensihi offer?",
  "How does Sensihi work with existing tools?",
  "Can I talk to someone from Sensihi?",
]

function generateSessionId() {
  return `sess_${Math.random().toString(36).slice(2)}`
}

export function SensihiCopilot({ apiUrl }: { apiUrl: string }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [ctas, setCtas] = useState<CTA[]>([])
  const [refs, setRefs] = useState<Reference[]>([])

  const sessionId = useRef(generateSessionId())
  const bottomRef = useRef<HTMLDivElement>(null)

  const isPhone =
    typeof window !== "undefined" && window.innerWidth < 480

  const dark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches

  const bg = dark ? "#0b0b0b" : "#ffffff"
  const fg = dark ? "#f5f5f5" : "#111"
  const subtle = dark ? "#999" : "#666"
  const border = dark ? "#1f1f1f" : "#eaeaea"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function sendMessage(text: string) {
    if (!text || loading) return

    setMessages((m) => [...m, { role: "user", content: text }])
    setInput("")
    setLoading(true)
    setCtas([])
    setRefs([])

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId.current,
          page:
            typeof window !== "undefined"
              ? window.location.pathname
              : "/",
        }),
      })

      const data: CopilotResponse = await res.json()

      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.message },
      ])
      setCtas(data.cta || [])
      setRefs(data.references || [])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "I couldn’t reach the copilot right now. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  /* ---------------- Pill Launcher ---------------- */

  if (!visible && !open) {
    return (
      <button
        onClick={() => {
          setVisible(true)
          requestAnimationFrame(() => setOpen(true))
        }}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          padding: "12px 18px",
          borderRadius: 999,
          background: "#111",
          color: "#fff",
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          zIndex: 9999,
        }}
      >
        Ask Sensihi ✦
      </button>
    )
  }

  /* ---------------- Panel ---------------- */

  return (
    <div
      style={{
        position: "fixed",
        right: isPhone ? 0 : 24,
        bottom: isPhone ? 0 : 96,
        width: isPhone ? "100%" : 420,
        height: isPhone ? "90vh" : 620,
        background: bg,
        color: fg,
        borderRadius: isPhone ? "16px 16px 0 0" : 16,
        boxShadow: "0 24px 60px rgba(0,0,0,.25)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,

        opacity: open ? 1 : 0,
        transform: open
          ? "translateY(0) scale(1)"
          : "translateY(16px) scale(.94)",
        transition:
          "all 240ms cubic-bezier(0.2,0,0,1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 16,
          borderBottom: `1px solid ${border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>Sensihi Copilot</strong>
        <button
          onClick={() => {
            setOpen(false)
            setTimeout(() => setVisible(false), 240)
          }}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 18,
            cursor: "pointer",
            color: subtle,
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: 16,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf:
                m.role === "user" ? "flex-end" : "flex-start",
              background:
                m.role === "user" ? "#111" : "#f2f2f2",
              color: m.role === "user" ? "#fff" : "#111",
              padding: "10px 14px",
              borderRadius: 12,
              maxWidth: "85%",
            }}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div style={{ color: subtle }}>Thinking…</div>
        )}

        {/* References (Insights / Blogs) */}
        {refs.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Related insights
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
              }}
            >
              {refs.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  style={{
                    minWidth: 220,
                    padding: 12,
                    borderRadius: 10,
                    background: dark ? "#141414" : "#f6f6f6",
                    textDecoration: "none",
                    color: fg,
                  }}
                >
                  {r.title}
                </a>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested Questions */}
      <div
        style={{
          padding: "8px 16px",
          overflowX: "auto",
          display: "flex",
          gap: 10,
          borderTop: `1px solid ${border}`,
        }}
      >
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            style={{
              whiteSpace: "nowrap",
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${border}`,
              background: "transparent",
              cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.borderColor = "#2f6bff")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.borderColor = border)
            }
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${border}`,
          display: "flex",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && sendMessage(input)
          }
          placeholder="Ask anything…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: `1px solid ${border}`,
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>

      {/* Disclaimer */}
      <div
        style={{
          padding: 12,
          fontSize: 12,
          color: subtle,
          textAlign: "center",
          borderTop: `1px solid ${border}`,
        }}
      >
        This is a Gen-AI experiment. Responses are based only on
        Sensihi insights and should be verified with cited sources.
      </div>
    </div>
  )
}

/* -------- Framer Controls -------- */
addPropertyControls(SensihiCopilot, {
  apiUrl: {
    type: ControlType.String,
    title: "API URL",
    defaultValue:
      "https://sensihi-copilot.vercel.app/api/copilot",
  },
})

export default SensihiCopilot
