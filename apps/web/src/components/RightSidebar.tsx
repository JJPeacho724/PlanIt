'use client'

import { useMemo, useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/Button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlannerSidebar } from '@/components/PlannerSidebar'
import EmailPanelV2 from '@/components/EmailPanelV2'
import EventsPanelV2 from '@/components/EventsPanelV2'

type EmailItem = {
  id: string
  fromName: string
  fromEmail: string
  subject: string
  snippet?: string
  dateISO: string
  included: boolean
}

type EventItem = {
  id: string
  title: string
  whenLabel: string
  status: 'pending' | 'confirmed'
  confidence?: number
}

type Selection = { emails: Set<string>; events: Set<string> }

export function RightSidebar({
  emails: propEmails,
  events: propEvents,
  onEmailsUpdate,
  onEventsAction,
}: {
  emails: EmailItem[]
  events: EventItem[]
  onEmailsUpdate: (ids: string[], change: { included?: boolean; scope?: 'subject' | 'summary' }) => void
  onEventsAction: (ids: string[], action: 'accept' | 'reject' | 'snooze' | 'delete') => void
}) {
  const [tab, setTab] = useState<'chat' | 'email' | 'events'>('chat')
  const [eventFilter, setEventFilter] = useState<'pending' | 'all'>('pending')
  const [sel, setSel] = useState<Selection>({ emails: new Set(), events: new Set() })
  const [tabShow, setTabShow] = useState(true)
  
  // Real data state
  const [emails, setEmails] = useState<EmailItem[]>(propEmails)
  const [events, setEvents] = useState<EventItem[]>(propEvents)
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [emailsUnauthorized, setEmailsUnauthorized] = useState(false)
  const [eventsUnauthorized, setEventsUnauthorized] = useState(false)

  // Time windows
  const nowMs = Date.now()
  const THIRTY_DAYS = 30 * 24 * 3600 * 1000
  const SEVEN_DAYS = 7 * 24 * 3600 * 1000
  const FOUR_WEEKS = 28 * 24 * 3600 * 1000
  const EIGHT_WEEKS = 56 * 24 * 3600 * 1000

  const [emailAfter, setEmailAfter] = useState<number>(nowMs - THIRTY_DAYS)
  const [emailBefore, setEmailBefore] = useState<number>(nowMs)
  const [eventsAfter, setEventsAfter] = useState<number>(nowMs) // default upcoming only
  const [eventsBefore, setEventsBefore] = useState<number>(nowMs + EIGHT_WEEKS)

  const visibleEvents = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    return list.filter((ev) => (eventFilter === 'all' ? true : ev.status === 'pending'))
  }, [events, eventFilter])

  // Fetch real data
  const mergeUniqueById = <T extends { id: string }>(prev: T[], next: T[]) => {
    const seen = new Set(prev.map((x) => x.id))
    const merged = [...prev]
    for (const n of next) {
      if (!seen.has(n.id)) merged.push(n)
    }
    return merged
  }

  const fetchEmails = async (opts?: { after?: number; before?: number; append?: boolean }) => {
    console.log('🔄 Starting email fetch...')
    setEmailsLoading(true)
    setEmailsUnauthorized(false) // Reset unauthorized state
    try {
      console.log('📡 Making API call to /api/context/emails (no params)')
      const response = await fetch('/api/context/emails')
      console.log('📡 API response status:', response.status)
      
      if (response.status === 401) {
        console.log('❌ Unauthorized - setting emailsUnauthorized to true')
        setEmailsUnauthorized(true)
        setEmails([])
      } else if (response.ok) {
        const data = await response.json()
        console.log('✅ Email data received:', data.length, 'emails')
        console.log('📄 First email preview:', data[0])
        if (opts?.append) setEmails((prev) => mergeUniqueById(prev, data))
        else setEmails(data)
        setEmailsUnauthorized(false) // Ensure it's false on successful fetch
      } else {
        console.error('❌ Email fetch failed with status:', response.status)
        const errorText = await response.text()
        console.error('❌ Error response:', errorText)
      }
    } catch (error) {
      console.error('❌ Failed to fetch emails:', error)
    } finally {
      setEmailsLoading(false)
      console.log('🏁 Email fetch completed')
    }
  }

  const fetchEvents = async (opts?: { after?: number; before?: number; append?: boolean }) => {
    setEventsLoading(true)
    setEventsUnauthorized(false) // Reset unauthorized state
    try {
      const after = opts?.after ?? eventsAfter
      const before = opts?.before ?? eventsBefore
      const url = new URL('/api/context/events', window.location.origin)
      url.searchParams.set('after', String(after))
      url.searchParams.set('before', String(before))
      url.searchParams.set('limit', '200')
      const response = await fetch(url.toString())
      if (response.status === 401) {
        // Preserve any optimistic drafts already in state for local/unauth mode
        setEventsUnauthorized(true)
      } else if (response.ok) {
        const data = await response.json()
        const items: EventItem[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : []
        if (opts?.append) setEvents((prev) => mergeUniqueById(prev, items))
        else setEvents(items)
        setEventsUnauthorized(false) // Ensure it's false on successful fetch
      } else {
        console.error('Events fetch failed with status:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch events:', error)
    } finally {
      setEventsLoading(false)
    }
  }

  const handleEventsAction = async (ids: string[], action: 'accept'|'reject'|'snooze'|'delete') => {
    try {
      // Optimistic UI: remove affected events from local state immediately
      setEvents(prev => prev.filter(ev => !ids.includes(ev.id)))
      await onEventsAction(ids, action)
    } catch (err) {
      // If API fails, refetch to reconcile
      console.error('Event action failed, refetching:', err)
    } finally {
      await fetchEvents({ after: eventsAfter, before: eventsBefore })
    }
  }

  // Proactively fetch on mount to ensure data shows without relying on tab switch
  useEffect(() => {
    if (emails.length === 0) {
      fetchEmails({ after: emailAfter, before: emailBefore })
    }
    if (events.length === 0) {
      fetchEvents({ after: eventsAfter, before: eventsBefore })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load data when component mounts and when tab changes
  useEffect(() => {
    if (tab === 'email' && emails.length === 0) {
      fetchEmails({ after: emailAfter, before: emailBefore })
    }
    if (tab === 'events' && events.length === 0) {
      fetchEvents({ after: eventsAfter, before: eventsBefore })
    }
    // Trigger a subtle fade/slide animation on tab switch
    setTabShow(false)
    const id = setTimeout(() => setTabShow(true), 15)
    return () => clearTimeout(id)
  }, [tab, emailAfter, emailBefore, eventsAfter, eventsBefore])

  // Listen for email ingestion completion
  useEffect(() => {
    const handleIngestionComplete = () => {
      if (tab === 'email') fetchEmails()
      if (tab === 'events') fetchEvents()
    }
    
    window.addEventListener('emailIngestionComplete', handleIngestionComplete)
    return () => window.removeEventListener('emailIngestionComplete', handleIngestionComplete)
  }, [tab])

  // When chatbot creates event drafts, switch to Events tab and refresh
  useEffect(() => {
    const onEventDraftsCreated = (e: any) => {
      setTab('events')
      // When drafts are created, show a wider future window (next 12 months)
      const oneYearMs = 365 * 24 * 3600 * 1000
      // If drafts include times earlier today, include the whole day to avoid filtering them out
      const incomingDrafts = Array.isArray(e?.detail?.drafts) ? e.detail.drafts : []
      const earliestStart: Date | null = (() => {
        try {
          const dates = incomingDrafts
            .map((d: any) => new Date(d?.startsAt || d?.startISO || d?.startsAtISO))
            .filter((d: Date) => Number.isFinite(d.getTime()))
            .sort((a: Date, b: Date) => a.getTime() - b.getTime())
          return dates[0] || null
        } catch { return null }
      })()
      const baseAfter = earliestStart ? new Date(earliestStart) : new Date()
      if (earliestStart) baseAfter.setHours(0, 0, 0, 0)
      const newAfter = baseAfter.getTime()
      const newBefore = newAfter + oneYearMs
      setEventsAfter(newAfter)
      setEventsBefore(newBefore)
      // Optimistically append received drafts if provided in the event detail
      try {
        const drafts = incomingDrafts
        if (drafts.length > 0) {
          const mapped = drafts.map((d: any) => {
            const s = new Date(d.startsAt || d.startISO || d.startsAtISO)
            const end = new Date(d.endsAt || d.endISO || d.endsAtISO)
            const whenLabel = `${s.toLocaleDateString()} ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            return {
              id: d.id,
              title: d.title || 'Scheduled task',
              whenLabel,
              startISO: s.toISOString(),
              status: 'pending' as const,
              confidence: typeof d.confidence === 'number' ? d.confidence : 0.7,
            }
          })
          setEvents(prev => {
            const seen = new Set(prev.map(x => x.id))
            const merged = [...prev]
            for (const m of mapped) if (!seen.has(m.id)) merged.push(m)
            return merged
          })
        }
      } catch {}
      fetchEvents({ after: newAfter, before: newBefore })
    }
    window.addEventListener('eventDraftsCreated', onEventDraftsCreated)
    return () => window.removeEventListener('eventDraftsCreated', onEventDraftsCreated)
  }, [eventsAfter, eventsBefore])

  const anySelected = sel.emails.size + sel.events.size > 0

  const toggle = (kind: 'email' | 'event', id: string) => {
    setSel((prev) => {
      const next = new Set(kind === 'email' ? prev.emails : prev.events)
      next.has(id) ? next.delete(id) : next.add(id)
      return kind === 'email' ? { ...prev, emails: next } : { ...prev, events: next }
    })
  }

  const clearSelection = () => setSel({ emails: new Set(), events: new Set() })

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!anySelected) return
      if (tab === 'events') {
        if (e.key === 'a') { onEventsAction(Array.from(sel.events), 'accept'); clearSelection() }
        if (e.key === 'r') { onEventsAction(Array.from(sel.events), 'reject'); clearSelection() }
        if (e.key === 's') { onEventsAction(Array.from(sel.events), 'snooze'); clearSelection() }
        if (e.key === 'd') { onEventsAction(Array.from(sel.events), 'delete'); clearSelection() }
      }
      if (tab === 'email') {
        if (e.key === 'i') { onEmailsUpdate(Array.from(sel.emails), { included: true }); clearSelection() }
        if (e.key === 'e') { onEmailsUpdate(Array.from(sel.emails), { included: false }); clearSelection() }
      }
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anySelected, sel, tab, onEmailsUpdate, onEventsAction])

  return (
    <aside className="min-w-[320px] w-[360px] max-w-[420px] border-l bg-surface flex flex-col h-full overflow-hidden">
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-medium text-text">Assistant</div>
          <div className="h-1 w-24 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '70%' }} />
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="px-2">
          <TabsList className="grid grid-cols-3 rounded-xl">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Keep Chat mounted always to preserve state; toggle visibility by tab */}
      <div
        className={tab === 'chat' ? 'flex-1 min-h-0 flex' : 'hidden'}
        style={{
          opacity: tabShow ? 1 : 0,
          transform: tabShow ? 'translateY(0px)' : 'translateY(4px)',
          transition: 'opacity 180ms ease, transform 180ms ease'
        }}
      >
        <div className="flex-1 min-h-0">
          <PlannerSidebar variant="embedded" />
        </div>
      </div>

      {/* Email/Events container, shown when not on Chat */}
      <div
        className={tab !== 'chat' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}
        style={{
          opacity: tabShow ? 1 : 0,
          transform: tabShow ? 'translateY(0px)' : 'translateY(4px)',
          transition: 'opacity 180ms ease, transform 180ms ease'
        }}
      >
        <div className="h-full flex flex-col">
          {tab === 'email' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between py-2 px-3 flex-shrink-0">
                <div className="text-xs text-text-muted">{emails.length} shown</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    console.log('🔄 Refresh button clicked')
                    fetchEmails({ after: emailAfter, before: emailBefore })
                  }}>Refresh</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const newAfter = emailAfter - THIRTY_DAYS
                    const newBefore = emailAfter
                    setEmailAfter(newAfter)
                    // keep emailBefore as is (now)
                    fetchEmails({ after: newAfter, before: newBefore, append: true })
                  }}>Load older 30d</Button>
                </div>
              </div>
              {emailsLoading ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="text-sm text-text-muted">Loading emails...</div>
                </div>
              ) : emailsUnauthorized ? (
                <div className="mt-4 flex flex-col items-center justify-center py-8 gap-3">
                  <div className="text-sm text-text-muted">Sign in to view your emails.</div>
                  <Button size="sm" onClick={() => signIn('google')}>Sign in</Button>
                </div>
              ) : emails.length === 0 ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="text-sm text-text-muted">No emails found.</div>
                </div>
              ) : (
                <EmailPanelV2
                  emails={emails}
                  onUpdate={(ids, change) => onEmailsUpdate(ids, change)}
                />
              )}
            </div>
          )}

          {tab === 'events' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 py-2 px-3 flex-shrink-0 flex-wrap">
                <Button size="sm" variant={eventFilter === 'pending' ? 'primary' : 'outline'} onClick={() => setEventFilter('pending')}>Pending</Button>
                <Button size="sm" variant={eventFilter === 'all' ? 'primary' : 'outline'} onClick={() => setEventFilter('all')}>All</Button>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <div className="text-xs text-text-muted">{visibleEvents.length} shown</div>
                  <Button size="sm" variant="ghost" onClick={() => fetchEvents({ after: eventsAfter, before: eventsBefore })}>Refresh</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const pastWeekAfter = eventsAfter - SEVEN_DAYS
                    const pastWeekBefore = eventsAfter
                    setEventsAfter(pastWeekAfter)
                    fetchEvents({ after: pastWeekAfter, before: pastWeekBefore, append: true })
                  }}>Past week</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const newAfter = eventsAfter - FOUR_WEEKS
                    const newBefore = eventsAfter
                    setEventsAfter(newAfter)
                    fetchEvents({ after: newAfter, before: newBefore, append: true })
                  }}>Older 4w</Button>
                </div>
              </div>
              <Separator />
              {eventsLoading ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="text-sm text-text-muted">Loading events...</div>
                </div>
              ) : eventsUnauthorized ? (
                <div className="mt-4 flex flex-col items-center justify-center py-8 gap-3">
                  <div className="text-sm text-text-muted">Sign in to view your events.</div>
                  <Button size="sm" onClick={() => signIn('google')}>Sign in</Button>
                </div>
              ) : visibleEvents.length === 0 ? (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="text-sm text-text-muted">No events to show.</div>
                </div>
              ) : (
                <EventsPanelV2
                  events={visibleEvents}
                  onAction={(ids, action) => handleEventsAction(ids, action)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {anySelected && (
        <div className="sticky bottom-0 z-50 border-t bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 shadow-md p-3 flex items-center justify-between">
          <div className="text-sm text-text">
            {sel.emails.size + sel.events.size} selected
            <Button variant="ghost" className="ml-2 px-1" onClick={clearSelection} size="sm">Clear</Button>
          </div>
          {tab === 'events' ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onEventsAction(Array.from(sel.events), 'accept'); clearSelection() }}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => { onEventsAction(Array.from(sel.events), 'reject'); clearSelection() }}>Reject</Button>
              <Button size="sm" variant="ghost" onClick={() => { onEventsAction(Array.from(sel.events), 'snooze'); clearSelection() }}>Snooze</Button>
              <Button size="sm" variant="destructive" onClick={() => { onEventsAction(Array.from(sel.events), 'delete'); clearSelection() }}>Delete</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onEmailsUpdate(Array.from(sel.emails), { included: true }); clearSelection() }}>Include</Button>
              <Button size="sm" variant="outline" onClick={() => { onEmailsUpdate(Array.from(sel.emails), { included: false }); clearSelection() }}>Exclude</Button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

export default RightSidebar


