import { useState, useEffect, useRef } from 'react'
import { sendChat, getRoom } from '../network/colyseus'

interface Message {
  id: string
  sender: string
  text: string
  timestamp: number
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const room = getRoom()
    if (!room) return

    const handler = (msg: Message) => {
      setMessages((prev) => [...prev.slice(-40), msg])
    }
    room.onMessage('chat', handler)
    return () => {
      // colyseus doesn't have off easily in this version, ignore
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight)
  }, [messages])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendChat(input.trim())
    setInput('')
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 90,
      left: 12,
      width: 320,
      maxWidth: '90vw',
      zIndex: 20,
      pointerEvents: 'auto',
    }}>
      {open && (
        <div style={{
          background: 'rgba(0,0,0,0.65)',
          borderRadius: 10,
          padding: 10,
          marginBottom: 6,
          maxHeight: 180,
          overflowY: 'auto',
        }} ref={listRef}>
          {messages.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No messages yet</div>
          )}
          {messages.map((m) => (
            <div key={m.id} style={{ color: '#fff', fontSize: 13, marginBottom: 4 }}>
              <strong style={{ color: '#81c784' }}>{m.sender}</strong>: {m.text}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          💬
        </button>
        {open && (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#fff',
              padding: '6px 10px',
              outline: 'none',
            }}
          />
        )}
      </form>
    </div>
  )
}
