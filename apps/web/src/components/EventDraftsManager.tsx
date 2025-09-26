'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, Clock, CheckCircle2, X, Sparkles, ArrowRight, AlertCircle } from 'lucide-react'

interface EventDraft {
  id: string
  title: string | null
  startsAt: string
  endsAt: string
  rationale: string | null
  confidence: number | null
  task?: {
    id: string
    title: string
    description: string | null
    source: string
    tags: string[]
  } | null
}

interface EventDraftsManagerProps {
  className?: string
  autoRefresh?: boolean
}

export function EventDraftsManager({ className = '', autoRefresh = false }: EventDraftsManagerProps) {
  const { status } = useSession()
  const [eventDrafts, setEventDrafts] = useState<EventDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(new Set())

  const fetchEventDrafts = async () => {
    try {
      const response = await fetch('/api/events/generate')
      if (!response.ok) throw new Error('Failed to fetch event drafts')
      
      const data = await response.json()
      if (data.success) {
        setEventDrafts(data.eventDrafts || [])
      } else {
        setError(data.error || 'Failed to load event drafts')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const generateEvents = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/events/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeGoogleData: true,
          preferences: {
            breakMinutes: 15,
            minBlockMinutes: 30,
            resolveConflicts: 'push'
          }
        })
      })
      
      if (!response.ok) throw new Error('Failed to generate events')
      
      const data = await response.json()
      if (data.success) {
        setEventDrafts(data.eventDrafts || [])
        setSelectedDrafts(new Set()) // Clear selection
      } else {
        setError(data.error || 'Failed to generate events')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const confirmEvents = async (draftIds: string[], syncToGoogle = true) => {
    setConfirming(draftIds)
    
    try {
      const response = await fetch('/api/events/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventDraftIds: draftIds,
          syncToGoogle
        })
      })
      
      if (!response.ok) throw new Error('Failed to confirm events')
      
      const data = await response.json()
      if (data.success) {
        // Remove confirmed drafts from the list
        setEventDrafts(prev => prev.filter(draft => !draftIds.includes(draft.id)))
        setSelectedDrafts(new Set())
        
        // Sync feedback
        if (syncToGoogle) {
          if (data.syncedToGoogle) {
            // no-op, success
          } else {
            setError('Events created locally. Connect Google in Settings → Connections to sync to Google Calendar.')
          }
          if (data.syncErrors?.length > 0) {
            setError(`Some events couldn't sync to Google Calendar: ${data.syncErrors.map((e: any) => e.title).join(', ')}`)
          }
        }

        // Ask the calendar to refresh (to include newly synced Google events)
        try {
          window.dispatchEvent(new CustomEvent('planit:calendar-refresh', { detail: { refresh: true } }))
        } catch {}
      } else {
        setError(data.error || 'Failed to confirm events')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setConfirming([])
    }
  }

  const deleteEvents = async (draftIds: string[]) => {
    try {
      const response = await fetch('/api/events/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventDraftIds: draftIds, action: 'delete' })
      })
      
      if (!response.ok) throw new Error('Failed to delete events')
      
      const data = await response.json()
      if (data.success) {
        setEventDrafts(prev => prev.filter(draft => !draftIds.includes(draft.id)))
        setSelectedDrafts(new Set())
      } else {
        setError(data.error || 'Failed to delete events')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const toggleSelection = (draftId: string) => {
    setSelectedDrafts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(draftId)) {
        newSet.delete(draftId)
      } else {
        newSet.add(draftId)
      }
      return newSet
    })
  }

  const selectAll = () => {
    setSelectedDrafts(new Set(eventDrafts.map(d => d.id)))
  }

  const clearSelection = () => {
    setSelectedDrafts(new Set())
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEventDrafts()
    } else if (status === 'loading') {
      setLoading(true)
    }
  }, [status])

  useEffect(() => {
    if (autoRefresh && status === 'authenticated') {
      const interval = setInterval(fetchEventDrafts, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh, status])

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const getConfidenceColor = (confidence: number | null) => {
    if (!confidence) return 'text-gray-400'
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'EMAIL': return 'bg-blue-100 text-blue-800'
      case 'CALENDAR': return 'bg-green-100 text-green-800'
      case 'MANUAL': return 'bg-gray-100 text-gray-800'
      default: return 'bg-purple-100 text-purple-800'
    }
  }

  if (loading && eventDrafts.length === 0) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center">
          <Calendar className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm text-text-muted">Loading event suggestions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Event Suggestions
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Suggestions based on recent emails and tasks
          </p>
        </div>
        <button
          onClick={generateEvents}
          disabled={loading}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Events'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger" />
          <span className="text-sm text-danger">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-danger hover:text-danger/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {eventDrafts.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-text-muted" />
          <h3 className="text-sm font-medium text-text mb-1">No suggestions yet</h3>
          <p className="text-sm text-text-muted mb-4">
            Generate suggestions from your tasks and calendar data
          </p>
          <button
            onClick={generateEvents}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            Generate Events
          </button>
        </div>
      ) : (
        <>
          {/* Bulk Actions */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-md border border-border">
            <div className="flex items-center gap-2">
              <button
                onClick={selectedDrafts.size === eventDrafts.length ? clearSelection : selectAll}
                className="text-sm text-primary hover:text-primary/80"
              >
                {selectedDrafts.size === eventDrafts.length ? 'Clear All' : 'Select All'}
              </button>
              <span className="text-sm text-text-muted">
                {selectedDrafts.size} of {eventDrafts.length} selected
              </span>
            </div>
            
            {selectedDrafts.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => confirmEvents(Array.from(selectedDrafts), true)}
                  disabled={confirming.length > 0}
                  className="px-3 py-1.5 bg-success text-white text-sm rounded-md hover:bg-success/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Sync
                </button>
                <button
                  onClick={() => deleteEvents(Array.from(selectedDrafts))}
                  className="px-3 py-1.5 bg-danger text-white text-sm rounded-md hover:bg-danger/90 transition-colors flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Event List */}
          <div className="space-y-3">
            {eventDrafts.map((draft) => {
              const start = formatDateTime(draft.startsAt)
              const end = formatDateTime(draft.endsAt)
              const isSelected = selectedDrafts.has(draft.id)
              const isConfirming = confirming.includes(draft.id)

              return (
                <div
                  key={draft.id}
                  className={`p-4 border rounded-md transition-all cursor-pointer hover:shadow-sm ${
                    isSelected ? 'bg-primary/5 border-primary/20' : 'bg-bg border-border'
                  }`}
                  onClick={() => toggleSelection(draft.id)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(draft.id)}
                      className="mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3
                          className="font-medium text-text whitespace-normal break-words"
                          title={draft.title || 'Untitled Event'}
                        >
                          {draft.title || 'Untitled Event'}
                        </h3>
                        {draft.confidence && (
                          <span className={`text-xs px-2 py-1 rounded-md ${getConfidenceColor(draft.confidence)} bg-current/10`}>
                            {Math.round(draft.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-text-muted mb-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {start.date}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {start.time}
                          <ArrowRight className="w-3 h-3" />
                          {end.time}
                        </div>
                      </div>

                      {draft.task && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-2 py-1 rounded-md ${getSourceBadgeColor(draft.task.source)}`}>
                            {draft.task.source}
                          </span>
                          {draft.task.tags.map(tag => (
                            <span key={tag} className="text-xs px-2 py-1 bg-surface text-text-muted rounded-md">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {draft.rationale && (
                        <p className="text-sm text-text-muted">{draft.rationale}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          confirmEvents([draft.id], true)
                        }}
                        disabled={isConfirming}
                        className="px-3 py-1.5 bg-success text-white text-sm rounded-md hover:bg-success/90 transition-colors disabled:opacity-50"
                      >
                        {isConfirming ? 'Confirming...' : 'Confirm'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteEvents([draft.id])
                        }}
                        className="p-1.5 text-danger hover:bg-danger/10 rounded-md transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
