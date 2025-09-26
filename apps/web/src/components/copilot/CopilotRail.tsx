'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, Send, Brain, ThumbsUp, ThumbsDown, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { EventDraftPreview } from '../EventDraftPreview';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { ActionGroup } from '@/actions/ActionGroup'
import { useAreas, useRegisterArea } from '@/layout/AreaContext'
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmailContextPanel } from './panels/EmailContextPanel';
import { EventsReviewPanel } from './panels/EventsReviewPanel';
 
type Density = 'compact' | 'cozy' | 'comfortable';

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
  learning?: {
    variant?: string
    confidence?: number
    personalized?: boolean
    canProvideFeedback?: boolean
  }
}

export function CopilotRail({ onClose }: { onClose: () => void }) {
  const mounted = useAreas()
  useRegisterArea('rail')
  const [density, setDensity] = useState<Density>('cozy');
  const [messages, setMessages] = useState<Message[]>([{
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
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [eventActionLoading, setEventActionLoading] = useState(false);
  const [learningProgress, setLearningProgress] = useState<{confidence: number, totalInteractions: number}>({confidence: 0.3, totalInteractions: 0});
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages]);

  const pad = density === 'compact' ? 'p-3' : density === 'comfortable' ? 'p-6' : 'p-4';
  const gap = density === 'compact' ? 'gap-2' : density === 'comfortable' ? 'gap-4' : 'gap-3';

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

  const send = async (autoGenerateEvents = false) => {
    const text = input.trim()
    if (!text || isLoading) return
    
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    // Check if this looks like an email-based request
    const isEmailBasedRequest = /\b(email|emails|based on emails|day|plan.*day|today|schedule|calendar|inbox)\b/i.test(text)
    
    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          autoGenerateEvents,
          includeGoogleData: true 
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
      
      // Add context indicator if this was an email-based request
      if (isEmailBasedRequest && data.success) {
        replyContent = `📧 *Using your recent email context for planning*\n\n${replyContent}`
      }
      
      const reply: Message = { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: replyContent,
        // Do not attach eventDrafts to chat; they are shown in Events tab
        learning: data.learning
      }
      setMessages((prev) => [...prev, reply])
      
      // Update learning progress if we have learning metadata
      if (data.learning?.confidence) {
        setLearningProgress(prev => ({
          confidence: data.learning.confidence,
          totalInteractions: prev.totalInteractions + 1
        }))
      }
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
    <aside className={cn('h-full border-l bg-white/70 dark:bg-black/30 backdrop-blur flex flex-col overflow-hidden', pad)}>
      <h2 id="copilot-title" className="sr-only">Planning Copilot</h2>

      <div className="mb-3 px-3">
        <div className="text-xs text-neutral-500 mb-1">Learning progress</div>
        <Progress value={Math.round(learningProgress.confidence * 100)} />
      </div>

      <Tabs defaultValue="chat" className="h-[calc(100%-44px)] flex flex-col">
        <TabsList className="grid grid-cols-3 rounded-xl mb-2">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0">
          <div className="px-3 flex-shrink-0">
            <div className={cn('flex items-center justify-between', gap)}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent-600" />
              </div>
              <button onClick={onClose} className="rounded-md p-2 hover:bg-neutral-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-3 py-2">
              <ActionGroup area="rail" mounted={mounted} />
              <div className="mt-2">
                <OnboardingButton />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0 px-6 pt-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-primary text-white rounded-md' 
                    : 'bg-surface text-text rounded-md border border-border'
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

                      {m.learning && (
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

                      {m.eventDrafts && m.eventDrafts.length > 0 && (
                        <div className="mt-2 -mx-3">
                          <EventDraftPreview
                            events={m.eventDrafts}
                            onAccept={handleAcceptEvents}
                            onReject={handleRejectEvents}
                            onAcceptAll={() => handleAcceptEvents(m.eventDrafts?.map(e => e.id) || [])}
                            onRejectAll={() => handleRejectEvents(m.eventDrafts?.map(e => e.id) || [])}
                            loading={eventActionLoading}
                          />
                        </div>
                      )}

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
                <div className="max-w-[85%] px-3 py-2 text-xs bg-surface text-text rounded-md border border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                    <span className="text-xs text-text-muted">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="relative mb-3 flex-shrink-0 px-6">
            <input 
              className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 pr-14 text-xs placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors h-8" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Ask about planning, goal setting..." 
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); send(); } else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); send(true); } }}
              disabled={isLoading}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <button 
                className="w-5 h-5 rounded bg-success hover:bg-success/90 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                onClick={() => send(true)}
                disabled={isLoading || !input.trim()}
                title="Plan my day (Ctrl+Enter)"
              >
                <Sparkles className="w-3 h-3" />
              </button>
              <button 
                className="w-5 h-5 rounded bg-primary hover:bg-primary/90 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                onClick={() => send()}
                disabled={isLoading || !input.trim()}
                title="Send message (Enter)"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email" className="flex-1 overflow-y-auto px-3">
          <EmailContextPanel />
        </TabsContent>

        <TabsContent value="events" className="flex-1 overflow-y-auto px-3">
          <EventsReviewPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function OnboardingButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="px-2 py-1 border rounded text-xs" onClick={() => setOpen(true)}>Preferences</button>
      <OnboardingModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
