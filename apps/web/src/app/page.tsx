'use client'
import FullCalendar from '@fullcalendar/react'
import type { CalendarApi } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, X, Brain, Sparkles, Link as LinkIcon } from 'lucide-react'
import { useSession, signIn } from 'next-auth/react'
import { EventDraftsManager } from '@/components/EventDraftsManager'
import { HeaderBar } from '@/components/HeaderBar'
import { CopilotSheet } from '@/components/CopilotSheet'
import AppShell from '@/components/AppShell'
import { PageHeader } from '@/components/PageHeader'
import { CalendarToolbar } from '@/components/calendar/CalendarToolbar'
import { EmailIngestionStatus } from '@/components/EmailIngestionStatus'



export default function HomePage() {
  const { data: session, status } = useSession()
  const [showEventDrafts, setShowEventDrafts] = useState(false)
  const [showLearningInsights, setShowLearningInsights] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [view, setView] = useState<'month'|'week'|'day'>('week')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const calendarRef = useRef<FullCalendar>(null)
  const [isCalendarReady, setIsCalendarReady] = useState(false)
  const didInitialRefresh = useRef(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animDirection, setAnimDirection] = useState<'left'|'right'|'fade'>('fade')
  const containerRef = useRef<HTMLDivElement>(null)
  const [events, setEvents] = useState<any[]>([])
  const [calendarStatus, setCalendarStatus] = useState<'ok'|'not_connected'|'missing_scope'>('ok')
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [moreEvents, setMoreEvents] = useState<{ date: Date; items: any[] } | null>(null)

  const googleColors = ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9c27b0', '#ff6d01', '#039be5']
  
  // Map UI view -> FullCalendar view id
  const fullCalendarView = view === 'month' ? 'dayGridMonth' : view === 'day' ? 'timeGridDay' : 'timeGridWeek'


  
  // Helper to safely get FullCalendar API from ref
  const getCalendarApi = () => {
    try {
      if (calendarRef.current) {
        const api = calendarRef.current.getApi()
        // Validate that the API has the methods we need
        if (api && typeof api.prev === 'function' && typeof api.next === 'function' && typeof api.today === 'function') {
          return api
        }
      }
      return null
    } catch (e) {
      console.error('Error getting calendar API:', e)
      return null
    }
  }

  // Update calendar view when view state changes
  useEffect(() => {
    // Poll a few times to ensure the API is available, which avoids relying on DevTools timing
    let attempts = 0
    const intervalId = setInterval(() => {
      attempts++
      const api = getCalendarApi()
      if (!api) {
        if (attempts >= 10) {
          clearInterval(intervalId)
        }
        return
      }

      const targetView = view === 'month' ? 'dayGridMonth' : view === 'day' ? 'timeGridDay' : 'timeGridWeek'
      if (api.view?.type !== targetView) {
        setIsAnimating(true)
        setAnimDirection('fade')
        api.changeView(targetView)
        api.updateSize()
        // End animation shortly after view switch
        setTimeout(() => setIsAnimating(false), 260)
      } else {
        // Ensure correct sizing even when view doesn't change (first mount)
        api.updateSize()
      }
      clearInterval(intervalId)
    }, 50)

    return () => clearInterval(intervalId)
  }, [view])

  // Ensure calendar size recalculates on container/window resize (prevents overlaying scroller capturing clicks)
  useEffect(() => {
    const api = getCalendarApi()
    const handle = () => {
      const a = getCalendarApi()
      if (a) a.updateSize()
    }
    // Initial
    handle()
    // Window resize
    window.addEventListener('resize', handle)
    // Container resize
    let ro: ResizeObserver | null = null
    if (containerRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(() => handle())
      ro.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener('resize', handle)
      if (ro && containerRef.current) ro.disconnect()
    }
  }, [])

  // Fetch events from API when date range or session changes
  useEffect(() => {
    const api = getCalendarApi()
    if (!api || status !== 'authenticated') return
    const viewObj: any = api.view
    const start = viewObj?.currentStart as Date | undefined
    const end = viewObj?.currentEnd as Date | undefined
    const after = start ? start.getTime() : undefined
    const before = end ? end.getTime() : undefined
    const qs = new URLSearchParams()
    if (after) qs.set('after', String(after))
    if (before) qs.set('before', String(before))
    // On first ready pass, ask API to refresh Google cache
    if (!isCalendarReady) qs.set('refresh', 'true')
    const url = `/api/calendar/events${qs.toString() ? `?${qs.toString()}` : ''}`
    fetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load events')))
      .then(data => {
        setEvents(data.events || [])
        if (data?.status?.calendar) setCalendarStatus(data.status.calendar)
      })
      .catch(err => console.warn('Failed to fetch calendar events:', err))
  }, [status, view, currentDate])

  // Listen for refresh requests from other components (e.g., after accepting events)
  useEffect(() => {
    const handler = (e: any) => {
      const api = getCalendarApi()
      if (!api || status !== 'authenticated') return
      const viewObj: any = api.view
      const start = viewObj?.currentStart as Date | undefined
      const end = viewObj?.currentEnd as Date | undefined
      const after = start ? start.getTime() : undefined
      const before = end ? end.getTime() : undefined
      const qs = new URLSearchParams()
      if (after) qs.set('after', String(after))
      if (before) qs.set('before', String(before))
      if (e?.detail?.refresh) qs.set('refresh', 'true')
      const url = `/api/calendar/events${qs.toString() ? `?${qs.toString()}` : ''}`
      fetch(url, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load events')))
        .then(data => {
          setEvents(data.events || [])
          if (data?.status?.calendar) setCalendarStatus(data.status.calendar)
        })
        .catch(err => console.warn('Failed to fetch calendar events:', err))
    }
    window.addEventListener('planit:calendar-refresh', handler)
    return () => window.removeEventListener('planit:calendar-refresh', handler)
  }, [status])

  // Once the calendar signals it's ready, force a size recalculation.
  // This fixes cases where clicks only work after a manual resize (e.g. opening DevTools).
  useEffect(() => {
    if (!isCalendarReady) return
    const api = getCalendarApi()
    if (!api) return
    // Call twice with a short delay to catch late layout shifts
    api.updateSize()
    const t = setTimeout(() => {
      const a = getCalendarApi()
      if (a) a.updateSize()
    }, 100)
    return () => clearTimeout(t)
  }, [isCalendarReady])

  
  const addEvent = (info: any) => {
    const title = prompt('Event Title?')
    if (title) {
      const randomColor = googleColors[Math.floor(Math.random() * googleColors.length)]
      const textColor = randomColor === '#fbbc04' ? '#202124' : '#ffffff'
      
      const newEvent = {
        id: crypto.randomUUID(),
        title,
        start: info.date,
        allDay: info.allDay,
        backgroundColor: randomColor,
        borderColor: randomColor,
        textColor: textColor
      }
      setEvents((prev) => [...prev, newEvent])
    }
  }

  const executeWithCalendarApi = (action: (api: any) => void, retries = 3) => {
    const api = getCalendarApi()
    if (api) {
      action(api)
      return
    }
    
    if (retries > 0) {
      setTimeout(() => {
        executeWithCalendarApi(action, retries - 1)
      }, 50)
    } else {
      console.warn('Calendar API not available after retries')
    }
  }

  const handlePrev = () => {
    setIsAnimating(true)
    setAnimDirection('right')
    setCurrentDate((prev) => {
      const next = new Date(prev)
      if (view === 'day') next.setDate(next.getDate() - 1)
      else if (view === 'week') next.setDate(next.getDate() - 7)
      else next.setMonth(next.getMonth() - 1)
      return next
    })
    setTimeout(() => setIsAnimating(false), 260)
  }

  const handleNext = () => {
    setIsAnimating(true)
    setAnimDirection('left')
    setCurrentDate((prev) => {
      const next = new Date(prev)
      if (view === 'day') next.setDate(next.getDate() + 1)
      else if (view === 'week') next.setDate(next.getDate() + 7)
      else next.setMonth(next.getMonth() + 1)
      return next
    })
    setTimeout(() => setIsAnimating(false), 260)
  }

  const handleToday = () => {
    setIsAnimating(true)
    setAnimDirection('fade')
    setCurrentDate(new Date())
    setTimeout(() => setIsAnimating(false), 260)
  }

  const calendarView = (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="px-4 pt-2">
        <PageHeader title="Calendar" />
      </div>
      <div className="px-4 py-2 relative z-20">
        <CalendarToolbar
          view={view}
          onViewChange={(newView) => {
            console.log('📅 VIEW CHANGE REQUESTED:', newView)
            const order = ['month','week','day'] as const
            const oldIdx = order.indexOf(view)
            const newIdx = order.indexOf(newView)
            if (newIdx > oldIdx) setAnimDirection('left')
            else if (newIdx < oldIdx) setAnimDirection('right')
            else setAnimDirection('fade')
            setIsAnimating(true)
            setView(newView)
          }}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
        />
      </div>
      <div className="px-4 pb-2">
        <EmailIngestionStatus />
      </div>

      {(calendarStatus === 'not_connected' || calendarStatus === 'missing_scope') && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 flex items-center justify-between">
          <div className="text-sm">
            {calendarStatus === 'not_connected' ? 'Connect Google to show your calendar events.' : 'Re-connect Google with Calendar permission to show events.'}
          </div>
          <button
            onClick={() => { window.location.href = '/api/integrations/connect/google' }}
            className="ml-3 inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
          >
            <LinkIcon className="w-4 h-4" /> {calendarStatus === 'not_connected' ? 'Connect' : 'Re-connect'}
          </button>
        </div>
      )}

      <section className="flex-1 overflow-hidden p-2">
        <div className="hidden sm:block w-full h-full">
          <div ref={containerRef} className={`w-full h-full rounded-2xl border border-neutral-200/60 overflow-visible ${isAnimating ? (animDirection === 'left' ? 'calendar-animating-left' : animDirection === 'right' ? 'calendar-animating-right' : 'calendar-animating-fade') : ''}`}>
            <FullCalendar
            key={`${fullCalendarView}-${currentDate.toISOString().slice(0,10)}`}
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={fullCalendarView}
            initialDate={currentDate}
            handleWindowResize={true}
            headerToolbar={{ 
              left: '',
              center: 'title',
              right: session ? 'addEvent,suggestions,learningInsights,connections' : 'signin'
            }}
            customButtons={{
              addEvent: {
                text: '+ Event',
                click: () => {
                  const title = prompt('Event Title?')
                  if (title) {
                    const randomColor = googleColors[Math.floor(Math.random() * googleColors.length)]
                    const textColor = randomColor === '#fbbc04' ? '#202124' : '#ffffff'
                    
                    const newEvent = {
                      id: crypto.randomUUID(),
                      title,
                      start: new Date(),
                      backgroundColor: randomColor,
                      borderColor: randomColor,
                      textColor: textColor
                    }
                    setEvents((prev) => [...prev, newEvent])
                  }
                }
              },
              suggestions: {
                text: 'Drafts',
                click: () => setShowEventDrafts(true)
              },
              learningInsights: {
                text: '🧠 AI',
                click: () => setShowLearningInsights(true)
              },
              connections: {
                text: '⚙️',
                click: () => {
                  window.location.href = '/settings/connections'
                }
              },
              signin: {
                text: 'Sign In',
                click: () => signIn('google')
              }
            }}
            height="100%"
            expandRows={true}
            stickyHeaderDates={true}
            firstDay={0}
            dayHeaderFormat={{ weekday: 'short' }}
            selectable
            editable
            events={events}
            dateClick={addEvent}
            eventClick={(info: any) => {
              try {
                const ev = info?.event
                if (!ev) return
                const ext = ev.extendedProps || {}
                // Visually mark selected event
                try {
                  document.querySelectorAll('.fc .fc-event').forEach((el) => el.removeAttribute('data-selected'))
                  if (info?.el) (info.el as HTMLElement).setAttribute('data-selected', 'true')
                } catch {}
                setSelectedEvent({
                  id: ev.id,
                  title: ev.title,
                  start: ev.start,
                  end: ev.end,
                  allDay: ev.allDay,
                  backgroundColor: (ev as any).backgroundColor,
                  borderColor: (ev as any).borderColor,
                  textColor: (ev as any).textColor,
                  location: ext.location || '',
                  description: ext.description || '',
                  attendees: ext.attendees || [],
                  videoLink: ext.conferenceUrl || ext.hangoutLink || '',
                  type: ext.type || 'confirmed',
                })
              } catch {}
            }}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:15:00"
            slotLabelInterval="01:00"
            slotLabelFormat={{
              hour: 'numeric',
              meridiem: 'short'
            }}
            nowIndicator
            weekends={true}
            dayMaxEvents={3}
            moreLinkClick={(arg: any) => {
              try {
                const day = new Date(arg?.date || currentDate)
                const items = events.filter((e) => {
                  const s = new Date(e.start)
                  return s.getFullYear() === day.getFullYear() && s.getMonth() === day.getMonth() && s.getDate() === day.getDate()
                })
                setMoreEvents({ date: day, items })
                return 'prevent'
              } catch {
                return 'popover'
              }
            }}
            eventDisplay="block"
            displayEventTime={true}
            allDaySlot={true}
            eventMinHeight={18}
            eventContent={(arg: any) => {
              const title = arg?.event?.title || ''
              const timeText = arg?.timeText || ''
              const type = arg?.event?.extendedProps?.type || ''
              return (
                <div className="fc-event-inner" data-type={type}>
                  <div className="fc-event-title-line">
                    <span className="fc-event-title-text" title={title}>{title}</span>
                  </div>
                  {timeText && <div className="fc-event-subtext">{timeText}</div>}
                </div>
              )
            }}
            eventDidMount={(info: any) => {
              try {
                const t = info?.event?.title || ''
                const s = info?.event?.start
                const e = info?.event?.end
                const time = s ? new Date(s).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : ''
                const timeEnd = e ? new Date(e).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : ''
                const tooltip = time && timeEnd ? `${t} (${time}–${timeEnd})` : t
                if (info?.el) {
                  info.el.setAttribute('title', tooltip)
                  const type = info?.event?.extendedProps?.type
                  if (type) (info.el as HTMLElement).setAttribute('data-type', String(type))
                }
              } catch {}
            }}
            datesSet={(dateInfo: any) => {
              console.log('Calendar ready via datesSet')
              if (!isCalendarReady) {
                setIsCalendarReady(true)
              }
              // Refresh events when range changes
              if (status === 'authenticated') {
                const start = dateInfo.start as Date
                const end = dateInfo.end as Date
                const qs = new URLSearchParams()
                if (start) qs.set('after', String(start.getTime()))
                if (end) qs.set('before', String(end.getTime()))
                // Ensure we trigger a Google cache refresh once on initial ready
                if (!didInitialRefresh.current) {
                  qs.set('refresh', 'true')
                  didInitialRefresh.current = true
                }
                const url = `/api/calendar/events${qs.toString() ? `?${qs.toString()}` : ''}`
                fetch(url, { cache: 'no-store' })
                  .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load events')))
                  .then(data => {
                    setEvents(data.events || [])
                    if (data?.status?.calendar) setCalendarStatus(data.status.calendar)
                  })
                  .catch(err => console.warn('Failed to fetch calendar events:', err))
              }
            }}
            viewDidMount={(viewInfo: any) => {
              console.log('Calendar view mounted:', viewInfo.view.type)
              if (!isCalendarReady) {
                setIsCalendarReady(true)
              }
            }}
          />
          </div>
        </div>

        <div className="sm:hidden w-full h-full overflow-auto">
          <div className="rounded-2xl border border-neutral-200/60 bg-white divide-y">
            {useMemo(() => {
              const byDay = new Map<string, any[]>()
              for (const ev of events) {
                const d = new Date(ev.start)
                const key = d.toDateString()
                const arr = byDay.get(key) || []
                arr.push(ev)
                byDay.set(key, arr)
              }
              const entries = [...byDay.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
              return entries
            }, [events]).map(([label, items]) => (
              <div key={label} className="p-3">
                <div className="text-xs font-medium text-neutral-600 mb-2">{label}</div>
                <ul className="space-y-2">
                  {items.map((ev: any) => (
                    <li key={ev.id} className="p-2 rounded-md border hover:bg-neutral-50 cursor-pointer" onClick={() => setSelectedEvent({ ...ev, start: new Date(ev.start), end: ev.end ? new Date(ev.end) : null })}>
                      <div className="text-sm font-medium truncate" title={ev.title}>{ev.title}</div>
                      <div className="text-xs text-neutral-500">
                        {ev.allDay ? 'All day' : `${new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${ev.end ? ` – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CopilotSheet open={copilotOpen} onOpenChange={setCopilotOpen} />

      {/* Event Suggestions Modal */}
      {showEventDrafts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-bg rounded-md shadow-sm max-w-4xl w-full max-h-[80vh] overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                Event Suggestions
              </h2>
              <button
                onClick={() => setShowEventDrafts(false)}
                className="p-2 hover:bg-surface rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
              <EventDraftsManager autoRefresh={true} />
            </div>
          </div>
        </div>
      )}

      {/* Learning Insights Modal */}
      {showLearningInsights && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-bg rounded-md shadow-sm max-w-4xl w-full max-h-[80vh] overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                AI Learning Insights
              </h2>
              <button
                onClick={() => setShowLearningInsights(false)}
                className="p-2 hover:bg-surface rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-6">
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-primary/10 to-success/10 p-4 rounded-lg">
                  <h3 className="font-medium text-text mb-2">🧠 Your AI is Learning!</h3>
                  <p className="text-sm text-text-muted">
                    Your personal planning assistant is continuously learning from your interactions, 
                    preferences, and feedback to provide increasingly personalized recommendations.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-surface rounded-lg border border-border">
                    <h4 className="font-medium text-text mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Learning Features
                    </h4>
                    <ul className="text-sm text-text-muted space-y-1">
                      <li>• Remembers your scheduling preferences</li>
                      <li>• Learns from your feedback</li>
                      <li>• Adapts to your work patterns</li>
                      <li>• Improves recommendations over time</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-surface rounded-lg border border-border">
                    <h4 className="font-medium text-text mb-2 flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-success" />
                      Smart Suggestions
                    </h4>
                    <ul className="text-sm text-text-muted space-y-1">
                      <li>• Event time optimization</li>
                      <li>• Task priority learning</li>
                      <li>• Calendar conflict resolution</li>
                      <li>• Energy level awareness</li>
                    </ul>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-text-muted mb-4">
                    Use the AI assistant in the sidebar to start training your personal planner!
                  </p>
                  <button
                    onClick={() => setShowLearningInsights(false)}
                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Got it, start learning!
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {moreEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setMoreEvents(null) }}>
          <div className="bg-white rounded-md shadow-lg max-w-lg w-full border border-neutral-200">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="text-sm font-semibold">Events on {moreEvents.date.toDateString()}</h3>
              <button className="p-1 rounded hover:bg-neutral-100" onClick={() => setMoreEvents(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-2">
              <ul className="space-y-2">
                {moreEvents.items.map((ev) => (
                  <li key={ev.id} className="p-2 rounded border hover:bg-neutral-50 cursor-pointer" onClick={() => { setSelectedEvent({ ...ev, start: new Date(ev.start), end: ev.end ? new Date(ev.end) : null }); setMoreEvents(null) }}>
                    <div className="text-sm font-medium truncate" title={ev.title}>{ev.title}</div>
                    <div className="text-xs text-neutral-600">
                      {ev.allDay ? 'All day' : `${new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${ev.end ? ` – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedEvent(null) }}>
          <div className="bg-white rounded-md shadow-lg max-w-xl w-full border border-neutral-200">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-base">{selectedEvent.title}</h3>
              <button className="p-2 rounded hover:bg-neutral-100" onClick={() => setSelectedEvent(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-neutral-700">
                {selectedEvent.allDay ? 'All day' : `${new Date(selectedEvent.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${selectedEvent.end ? ` – ${new Date(selectedEvent.end).toLocaleString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
              </div>
              {selectedEvent.location && (
                <div className="text-sm"><span className="font-medium">Location:</span> {selectedEvent.location}</div>
              )}
              {selectedEvent.description && (
                <div className="text-sm whitespace-pre-wrap">{selectedEvent.description}</div>
              )}
              {Array.isArray(selectedEvent.attendees) && selectedEvent.attendees.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Attendees</div>
                  <ul className="text-sm text-neutral-700 list-disc pl-5">
                    {selectedEvent.attendees.map((a: any, idx: number) => (
                      <li key={idx}>{typeof a === 'string' ? a : (a?.email || a?.name || 'Unknown')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-3 border-t flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedEvent.videoLink && (
                  <a href={selectedEvent.videoLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">Join call</a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm rounded-md border hover:bg-neutral-50" onClick={() => setSelectedEvent(null)}>Close</button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border hover:bg-neutral-50"
                  onClick={() => {
                    alert('Edit coming soon')
                  }}
                >Edit</button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id))
                    setSelectedEvent(null)
                  }}
                >Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return <AppShell calendar={calendarView} />;
}

