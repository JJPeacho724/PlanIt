'use client'
import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Calendar, Brain, ThumbsUp, ThumbsDown, BookOpen, TrendingUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { ContextDisplay } from './ContextDisplay'
import { EventDraftPreview } from './EventDraftPreview'
import { EventChip } from '@/components/chat/EventChip'

type EventDraft = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  rationale?: string
  confidence?: number
}

type Message = { 
  id: string
  role: 'user' | 'assistant'
  content: string
  eventDrafts?: EventDraft[]
  latestPlanV2?: { actions: any[]; planNotes?: string } | null
  learning?: {
    variant?: string
    confidence?: number
    personalized?: boolean
    canProvideFeedback?: boolean
  }
  goal?: {
    label?: string
    templateKey?: string
    source?: string
  }
}

export function PlannerSidebar({ variant = 'default' }: { variant?: 'default' | 'embedded' }) {
  const [messages, setMessages] = useState<Message[]>(variant === 'embedded' ? [{
    id: 'm1', role: 'assistant', content: `Hello! I'm your AI planning assistant. I can help you organize your schedule, create calendar events from your emails, and manage your tasks efficiently.

Just type what you'd like to plan or organize, and I'll automatically create calendar events and help structure your day. ✨`
  }] : [{
    id: 'm1', role: 'assistant', content: `## 🧠 AI Learning Assistant

**Enhanced Features:**
• Personalized planning that learns from you
• Smart day planning with email context
• Career & professional development
• Financial goals & budgeting
• Health & wellness planning
• Time management & productivity

**Learning Capabilities:**
• Remembers your preferences and patterns
• A/B tests different planning approaches
• Improves recommendations over time
• Learns from your feedback

Ask about planning and goal achievement. I get smarter with every interaction! ✨`
  }])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [eventActionLoading, setEventActionLoading] = useState(false)
  const [learningProgress, setLearningProgress] = useState<{confidence: number, totalInteractions: number}>({confidence: 0.3, totalInteractions: 0})
  const [goalMeta, setGoalMeta] = useState<{label?: string; templateKey?: string; source?: string} | null>(null)
  const [goalOverride, setGoalOverride] = useState<{label?: string; templateKey?: string} | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleAcceptEvents = async (eventIds: string[]) => {
    setEventActionLoading(true)
    try {
      const res = await fetch('/api/events/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventDraftIds: eventIds,
          syncToGoogle: true 
        })
      })
      
      if (res.ok) {
        // Remove the event drafts from the message
        setMessages(prev => prev.map(msg => ({
          ...msg,
          eventDrafts: msg.eventDrafts?.filter(draft => !eventIds.includes(draft.id))
        })))
        
        // Add success message
        const successMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ **Events Created Successfully!**\n\n${eventIds.length} event${eventIds.length !== 1 ? 's' : ''} have been added to your calendar and synced to Google Calendar.`
        }
        setMessages(prev => [...prev, successMessage])

        // Ask the calendar to refresh (to include newly synced Google events)
        try {
          window.dispatchEvent(new CustomEvent('planit:calendar-refresh', { detail: { refresh: true } }))
        } catch {}
      }
    } catch (error) {
      console.error('Failed to accept events:', error)
    } finally {
      setEventActionLoading(false)
    }
  }

  const handleRejectEvents = async (eventIds: string[]) => {
    setEventActionLoading(true)
    try {
      const res = await fetch('/api/events/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventDraftIds: eventIds, action: 'delete' })
      })
      
      if (res.ok) {
        // Remove the event drafts from the message
        setMessages(prev => prev.map(msg => ({
          ...msg,
          eventDrafts: msg.eventDrafts?.filter(draft => !eventIds.includes(draft.id))
        })))
      }
    } catch (error) {
      console.error('Failed to reject events:', error)
    } finally {
      setEventActionLoading(false)
    }
  }

  const handleAddSingle = async (eventId: string) => {
    await handleAcceptEvents([eventId])
  }

  const handleEditSingle = (eventId: string) => {
    try {
      window.dispatchEvent(new CustomEvent('planit:open-event-editor', { detail: { id: eventId } }))
    } catch {}
  }

  // Learning functions
  const handleFeedback = async (messageId: string, isPositive: boolean) => {
    try {
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'plan_feedback',
          signal: messageId,
          success: isPositive,
          delta: isPositive ? 0.1 : -0.1
        })
      })
      
      // Update learning progress
      setLearningProgress(prev => ({
        confidence: Math.min(1, Math.max(0, prev.confidence + (isPositive ? 0.02 : -0.01))),
        totalInteractions: prev.totalInteractions + 1
      }))
      
      // Show feedback confirmation
      const feedbackMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${isPositive ? '✅ Thanks!' : '📝 Noted.'} I'm learning from your feedback to improve future recommendations.`
      }
      setMessages(prev => [...prev, feedbackMessage])
    } catch (error) {
      console.error('Failed to record feedback:', error)
    }
  }

  const handleRememberThis = async (content: string) => {
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remember: {
            factType: 'preference',
            key: 'user_preference',
            value: content,
            confidence: 0.8
          }
        })
      })
      
      const memoryMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `🧠 **Remembered!** I've saved this preference to improve future planning recommendations.`
      }
      setMessages(prev => [...prev, memoryMessage])
    } catch (error) {
      console.error('Failed to store memory:', error)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    // Check if this looks like an email-based request
    // Only treat as email-based when the user explicitly references email/inbox
    const isEmailBasedRequest = /\b(email|emails|inbox|from (?:my )?emails?)\b/i.test(text)
    
    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          // Do not auto-generate events unless explicitly requested
          autoGenerateEvents: false,
          includeGoogleData: true,
          goalTemplateOverride: goalOverride?.templateKey,
          goalLabelOverride: goalOverride?.label
        })
      })
      const data = await res.json()
      // If event drafts were generated, notify the sidebar Events tab and avoid rendering in chat
      try {
        if (Array.isArray(data?.eventDrafts) && data.eventDrafts.length > 0) {
          window.dispatchEvent(new CustomEvent('eventDraftsCreated', { detail: { count: data.eventDrafts.length, drafts: data.eventDrafts } }))
        }
      } catch {}
      
      let replyContent = data.reply ?? 'I understand. Let me help you plan that.'
      const conversational = typeof process !== 'undefined' && process.env && process.env.PLANNER_CONVERSATIONAL === '1'
      
      // Add context indicator if this was an email-based request
      if (isEmailBasedRequest && data.success) {
        replyContent = `📧 *Using your recent email context for planning*\n\n${replyContent}`
      }
      
      // Build Next 3 Actions snippet from EventPlanV2 if available
      // In conversational mode, do not append fixed template sections like "Next 3 Actions"
      let next3Block = ''
      if (!conversational && data?.latestPlanV2?.actions && Array.isArray(data.latestPlanV2.actions)) {
        const next3 = data.latestPlanV2.actions
          .slice(0, 3)
          .map((a: any) => {
            try {
              const t = new Date(a.startISO).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
              const path = a?.deliverable?.pathHint ? ` → ${a.deliverable.pathHint}` : ''
              return `• ${t} — ${a.title}${path}`
            } catch {
              return `• ${a.title}`
            }
          })
          .join('\n')
        if (next3) {
          next3Block = `\n\nNext 3 Actions\n${next3}`
        }
      }

      const reply: Message = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: replyContent + next3Block,
        // Attach up to 3 drafts for inline chips when conversational mode is on
        eventDrafts: conversational && Array.isArray(data?.eventDrafts) ? data.eventDrafts.slice(0, 3).map((d: any) => ({ id: d.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, confidence: d.confidence })) : undefined,
        latestPlanV2: data.latestPlanV2 || null,
        learning: data.learning,
        goal: data.goal || undefined
      }
      setMessages((prev) => [...prev, reply])
    } catch (e) {
      setMessages((prev) => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: '⚠️ **Connection Issue**\n\nI\'m having trouble connecting right now. Please try again in a moment.' 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden ${variant === 'embedded' ? '' : 'bg-bg'}`}>
      {/* Learning Progress Header */}
      {variant === 'embedded' ? null : (
        <div className="flex-shrink-0 p-3 border-b border-border bg-surface/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="font-medium text-text">Learning Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-success" />
                <span className="text-text-muted">{Math.round(learningProgress.confidence * 100)}%</span>
              </div>
              <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
                  style={{ width: `${learningProgress.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>
          {/* Goal/Template Chip */}
          {goalMeta && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                {goalMeta.templateKey} • {goalMeta.label || 'Goal'}
              </span>
              <span className="text-text-muted">({goalMeta.source})</span>
              <select
                className="ml-2 px-2 py-1 border border-border rounded bg-surface text-text"
                value={goalOverride?.templateKey || goalMeta.templateKey || ''}
                onChange={(e) => setGoalOverride(prev => ({ ...(prev || {}), templateKey: e.target.value }))}
              >
                {['GENERIC','PM','JOB','LEARN','WRITE','FITNESS','MARATHON','STARTUP'].map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input
                className="px-2 py-1 border border-border rounded bg-surface text-text"
                placeholder="Rename goal label"
                value={goalOverride?.label || goalMeta.label || ''}
                onChange={(e) => setGoalOverride(prev => ({ ...(prev || {}), label: e.target.value }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Messages - ChatGPT Style */}
      <div className="flex-1 overflow-y-auto space-y-6 mb-4 min-h-0 px-4 pt-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user' 
                ? 'bg-primary text-white rounded-2xl rounded-br-md' 
                : 'bg-surface text-text rounded-2xl rounded-bl-md border border-border/30'
            }`}>
              {m.role === 'assistant' ? (
                <div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown 
                      components={{
                        p: ({ children }) => <p className="mb-1.5 last:mb-0 text-xs text-text">{children}</p>,
                        ul: ({ children }) => <ul className="mb-1.5 pl-3 space-y-0.5 text-xs text-text">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-1.5 pl-3 space-y-0.5 text-xs text-text">{children}</ol>,
                        li: ({ children }) => <li className="text-xs text-text">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-xs text-text">{children}</strong>,
                        h1: ({ children }) => <h1 className="text-sm font-semibold mb-1.5 text-text">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold mb-1.5 text-text">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-medium mb-1 text-text">{children}</h3>,
                        code: ({ children }) => <code className="bg-bg px-1 py-0.5 rounded text-xs font-mono text-text">{children}</code>,
                        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/30 pl-3 italic text-text-muted">{children}</blockquote>
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                  
                  {/* Learning Metadata (hidden in conversational mode) */}
                  {m.learning && !(typeof process !== 'undefined' && process.env && process.env.PLANNER_CONVERSATIONAL === '1') && (
                    <div className="mt-2 p-2 bg-primary/5 rounded text-xs">
                      <div className="flex items-center justify-between text-text-muted">
                        <div className="flex items-center gap-2">
                          <Brain className="w-3 h-3" />
                          {!(typeof process !== 'undefined' && process.env && process.env.PLANNER_CONVERSATIONAL === '1') && (
                            <span>
                              {m.learning.personalized ? 'Personalized' : 'Standard'} • 
                              Variant {m.learning.variant} • 
                              {Math.round((m.learning.confidence || 0) * 100)}% confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Event Drafts Preview */}
                  {m.eventDrafts && m.eventDrafts.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {m.eventDrafts.slice(0, 3).map((e) => (
                        <EventChip
                          key={e.id}
                          title={e.title}
                          startsAt={e.startsAt}
                          endsAt={e.endsAt}
                          meta={e as any}
                          onAdd={() => handleAddSingle(e.id)}
                          onEdit={() => handleEditSingle(e.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Feedback Buttons */}
                  {m.learning?.canProvideFeedback && m.id !== 'm1' && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => handleFeedback(m.id, true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-success/10 hover:bg-success/20 text-success rounded transition-colors"
                        title="This was helpful"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        Helpful
                      </button>
                      <button
                        onClick={() => handleFeedback(m.id, false)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors"
                        title="This could be better"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        Improve
                      </button>
                      <button
                        onClick={() => handleRememberThis(m.content)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition-colors"
                        title="Remember this preference"
                      >
                        <BookOpen className="w-3 h-3" />
                        Remember
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <span>{m.content}</span>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-3 text-sm bg-surface text-text rounded-2xl rounded-bl-md border border-border/30">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
                <span className="text-sm text-text-muted">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input - ChatGPT Style */}
      <div className="relative mb-4 flex-shrink-0 px-4">
        <div className="relative flex items-center">
          <input 
            className={`w-full rounded-2xl border ${variant === 'embedded' ? 'border-border bg-surface' : 'border-border bg-bg'} px-4 py-3 pr-12 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 shadow-sm`}
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Message AI Assistant..." 
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={isLoading}
          />
          <button 
            className="absolute right-2 w-8 h-8 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-border text-white flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={() => send()}
            disabled={isLoading || !input.trim()}
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Quick suggestions - ChatGPT Style */}
      {variant === 'embedded' && messages.length === 1 ? (
        <div className="flex flex-wrap gap-2 flex-shrink-0 px-4 mb-4">
          {[
            'Plan my day from emails',
            'Schedule tasks', 
            'Create calendar events',
            'Organize my schedule'
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
              className="text-sm px-3 py-2 rounded-xl bg-surface hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-border/50 hover:border-border"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {/* Context Display */}
      {variant === 'embedded' ? null : <ContextDisplay />}
    </div>
  )
}

