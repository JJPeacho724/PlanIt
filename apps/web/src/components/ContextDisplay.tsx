'use client'

import { useState, useEffect } from 'react'
import { Mail, Calendar, ChevronDown, ChevronRight, Clock, User } from 'lucide-react'

interface EmailContext {
  date: string
  from: string
  subject: string
  bodySnippet: string
  receivedAt: string
}

interface EventDraft {
  id: string
  title: string
  startsAt: string
  endsAt: string
  rationale?: string
  confidence?: number
}

interface ContextData {
  emailContext: EmailContext[]
  eventDrafts: EventDraft[]
  lastUpdated?: string
}

export function ContextDisplay() {
  const [contextData, setContextData] = useState<ContextData>({ emailContext: [], eventDrafts: [] })
  const [emailsExpanded, setEmailsExpanded] = useState(false)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchContextData = async () => {
    setLoading(true)
    try {
      // Fetch recent email context
      const emailResponse = await fetch('/api/planner/email-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: new Date().toISOString().split('T')[0],
          preferences: {} 
        }),
      })
      
      let emailContext: EmailContext[] = []
      if (emailResponse.ok) {
        const emailData = await emailResponse.json()
        emailContext = emailData.emailContext || []
      }

      // Fetch pending event drafts
      const eventsResponse = await fetch('/api/events/generate')
      let eventDrafts: EventDraft[] = []
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json()
        eventDrafts = eventsData.eventDrafts || []
      }

      setContextData({
        emailContext,
        eventDrafts,
        lastUpdated: new Date().toLocaleTimeString()
      })
    } catch (error) {
      console.error('Failed to fetch context data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContextData()
    // Refresh context every 5 minutes
    const interval = setInterval(fetchContextData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50/50">
      {/* Email Context Section */}
      <div className="px-4 py-3">
        <button
          onClick={() => setEmailsExpanded(!emailsExpanded)}
          className="flex items-center justify-between w-full text-sm text-gray-700 hover:text-gray-900"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Email Context</span>
            <span className="text-xs text-gray-500">({contextData.emailContext.length})</span>
          </div>
          {emailsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        
        {emailsExpanded && contextData.emailContext.length > 0 && (
          <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
            {contextData.emailContext.slice(0, 5).map((email, index) => (
              <div key={index} className="text-xs bg-white rounded p-2 border border-gray-200">
                <div className="font-medium text-gray-800 whitespace-normal break-words" title={email.subject}>{email.subject}</div>
                <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                  <User className="w-3 h-3" />
                  <span className="whitespace-normal break-words" title={email.from}>{email.from}</span>
                </div>
                <div className="text-gray-600 mt-1 whitespace-normal break-words" title={email.bodySnippet}>{email.bodySnippet}</div>
                <div className="text-gray-400 mt-1">{formatDate(email.receivedAt)}</div>
              </div>
            ))}
            {contextData.emailContext.length > 5 && (
              <div className="text-xs text-gray-500 text-center py-1">
                +{contextData.emailContext.length - 5} more emails
              </div>
            )}
          </div>
        )}
        
        {emailsExpanded && contextData.emailContext.length === 0 && (
          <div className="mt-2 text-xs text-gray-500 text-center py-2">
            No recent emails found. Connect Gmail in settings to enable email-based planning.
          </div>
        )}
      </div>

      {/* Event Drafts Section */}
      <div className="px-4 py-3 border-t border-gray-200">
        <button
          onClick={() => setEventsExpanded(!eventsExpanded)}
          className="flex items-center justify-between w-full text-sm text-gray-700 hover:text-gray-900"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="font-medium">Pending Events</span>
            <span className="text-xs text-gray-500">({contextData.eventDrafts.length})</span>
          </div>
          {eventsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        
        {eventsExpanded && contextData.eventDrafts.length > 0 && (
          <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
            {contextData.eventDrafts.slice(0, 3).map((event) => (
              <div key={event.id} className="text-xs bg-white rounded p-2 border border-gray-200">
                <div className="font-medium text-gray-800 whitespace-normal break-words" title={event.title}>{event.title}</div>
                <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(event.startsAt)} - {formatTime(event.endsAt)}</span>
                </div>
                <div className="text-gray-600 mt-1">{formatDate(event.startsAt)}</div>
                {event.confidence && (
                  <div className="text-xs text-blue-600 mt-1">
                    Confidence: {Math.round(event.confidence * 100)}%
                  </div>
                )}
              </div>
            ))}
            {contextData.eventDrafts.length > 3 && (
              <div className="text-xs text-gray-500 text-center py-1">
                +{contextData.eventDrafts.length - 3} more events
              </div>
            )}
          </div>
        )}
        
        {eventsExpanded && contextData.eventDrafts.length === 0 && (
          <div className="mt-2 text-xs text-gray-500 text-center py-2">
            No pending events
          </div>
        )}
      </div>

      {/* Status Footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Context updated</span>
          <div className="flex items-center gap-1">
            {loading && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
            <span>{contextData.lastUpdated || 'Never'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
