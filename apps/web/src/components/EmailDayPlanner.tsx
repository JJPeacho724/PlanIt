'use client'

import { useState, useEffect } from 'react'
import { Loader2, Calendar, Brain, CheckCircle } from 'lucide-react'
import { useAutoIngest } from '@/components/AutoIngest'

interface EmailPlanningResponse {
  ok: boolean
  planningAdvice: string
  emailContext: Array<{
    date: string
    from: string
    subject: string
    bodySnippet: string
    receivedAt: string
  }>
  actionableEmails: number
  suggestedActions: Array<{
    id: string
    subject: string
    from: string
    suggestion: string
  }>
}

export function EmailDayPlanner() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmailPlanningResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoIngestStatus, setAutoIngestStatus] = useState<string>('Gmail auto-sync is running in the background')
  const { triggerIngest } = useAutoIngest()

  // Auto-check ingestion status on component mount
  useEffect(() => {
    const checkAutoIngestStatus = async () => {
      try {
        const result = await triggerIngest()
        if (result.ok) {
          if (result.tasksCreated > 0) {
            setAutoIngestStatus(`✅ Gmail auto-sync active - ${result.tasksCreated} new tasks found`)
          } else {
            setAutoIngestStatus('✅ Gmail auto-sync active - no new emails to process')
          }
        } else if (result.error === 'unauthorized') {
          setAutoIngestStatus('⚠️ Please connect your Gmail account to enable auto-sync')
        } else {
          setAutoIngestStatus('ℹ️ Gmail auto-sync is running periodically')
        }
      } catch (err) {
        setAutoIngestStatus('ℹ️ Gmail auto-sync is running in the background')
      }
    }
    
    checkAutoIngestStatus()
  }, [])

  const handlePlanDay = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/planner/email-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          preferences: {
            workingHours: { start: '09:00', end: '17:00' },
            breakMinutes: 15,
            maxMeetingsPerDay: 6
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate day plan')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Day Planner with Email Context
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                Plan Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button 
              onClick={handlePlanDay} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
              Plan Day
            </button>
          </div>
          
          {/* Auto-ingest status */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-md">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">{autoIngestStatus}</span>
          </div>
          
          {error && (
            <div className={`p-3 rounded ${error.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">AI Planning Advice</h3>
            </div>
            <div className="p-6">
              <div className="prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ 
                  __html: result.planningAdvice.replace(/\n/g, '<br>') 
                }} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Email Context ({result.emailContext.length} emails)</h3>
              </div>
              <div className="p-6">
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {result.emailContext.map((email, index) => (
                    <div key={index} className="border-l-2 border-blue-200 pl-3 text-sm">
                      <div className="font-medium">{email.subject}</div>
                      <div className="text-gray-600">From: {email.from}</div>
                      <div className="text-gray-500">{email.date}</div>
                      <div className="text-gray-700 mt-1">{email.bodySnippet}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {result.suggestedActions.length > 0 && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Suggested Actions ({result.suggestedActions.length})</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-2">
                    {result.suggestedActions.map((action, index) => (
                      <div key={index} className="p-2 bg-yellow-50 rounded text-sm">
                        <div className="font-medium">{action.subject}</div>
                        <div className="text-gray-600">{action.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
