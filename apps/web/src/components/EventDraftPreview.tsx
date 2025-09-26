'use client'

import { useState } from 'react'
import { Calendar, Clock, MapPin, User, Check, X, Sparkles } from 'lucide-react'

interface EventDraft {
  id: string
  title: string
  startsAt: string
  endsAt: string
  rationale?: string
  confidence?: number
  location?: string
  description?: string
  overlap?: boolean
}

interface EventDraftPreviewProps {
  events: EventDraft[]
  onAccept: (eventIds: string[]) => void
  onReject: (eventIds: string[]) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  loading?: boolean
}

export function EventDraftPreview({ 
  events, 
  onAccept, 
  onReject, 
  onAcceptAll, 
  onRejectAll, 
  loading = false 
}: EventDraftPreviewProps) {
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(events.map(e => e.id)))

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    })
  }

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const sameDay = startDate.toDateString() === endDate.toDateString()
    
    if (sameDay) {
      return `${formatDate(start)} • ${formatTime(start)} - ${formatTime(end)}`
    } else {
      return `${formatDate(start)} ${formatTime(start)} - ${formatDate(end)} ${formatTime(end)}`
    }
  }

  const toggleEvent = (eventId: string) => {
    const newSelected = new Set(selectedEvents)
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId)
    } else {
      newSelected.add(eventId)
    }
    setSelectedEvents(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set())
    } else {
      setSelectedEvents(new Set(events.map(e => e.id)))
    }
  }

  const handleAcceptSelected = () => {
    onAccept(Array.from(selectedEvents))
  }

  const handleRejectSelected = () => {
    onReject(Array.from(selectedEvents))
  }

  if (events.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 my-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Generated Events</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Select All Toggle */}
        <button
          onClick={toggleSelectAll}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {selectedEvents.size === events.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Events List */}
      <div className="space-y-3 mb-4">
        {events.map((event) => (
          <div
            key={event.id}
            className={`bg-white rounded-lg border-2 transition-all cursor-pointer ${
              selectedEvents.has(event.id)
                ? 'border-blue-300 bg-blue-50/30'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => toggleEvent(event.id)}
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(event.id)}
                      onChange={() => toggleEvent(event.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <h4 className="font-medium text-gray-900">{event.title}</h4>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDateRange(event.startsAt, event.endsAt)}</span>
                    </div>
                    {event.overlap && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Overlaps (stackable)</span>
                    )}
                    {event.confidence && (
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${
                          event.confidence > 0.8 ? 'bg-green-500' : 
                          event.confidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                        <span>{Math.round(event.confidence * 100)}% confidence</span>
                      </div>
                    )}
                  </div>

                  {event.rationale && (
                    <p className="text-sm text-gray-700 italic">"{event.rationale}"</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-blue-200">
        <div className="text-xs text-gray-600">
          {selectedEvents.size} of {events.length} selected
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleRejectSelected}
            disabled={selectedEvents.size === 0 || loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <X className="w-3 h-3" />
            Reject {selectedEvents.size > 0 ? `(${selectedEvents.size})` : ''}
          </button>
          
          <button
            onClick={handleAcceptSelected}
            disabled={selectedEvents.size === 0 || loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Check className="w-3 h-3" />
            {loading ? 'Creating...' : `Accept ${selectedEvents.size > 0 ? `(${selectedEvents.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
