'use client'
import { useEffect, useRef, useState } from 'react'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

export function PlannerSidebar() {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'm1', role: 'assistant', content: 'Hi! I\'m your Planner Agent. Ask me to schedule tasks.'
  }])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text) return
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      const reply: Message = { id: crypto.randomUUID(), role: 'assistant', content: data.reply ?? 'Okay.' }
      setMessages((prev) => [...prev, reply])
    } catch (e) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Error while planning.' }])
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-2 text-lg font-semibold">Planner Agent</h2>
      <div className="flex-1 space-y-2 overflow-auto rounded border p-2">
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block rounded-md px-3 py-2 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <input className="w-full rounded-md border px-3 py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask to plan…" onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
        <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" onClick={send}>Send</button>
      </div>
    </div>
  )
}

