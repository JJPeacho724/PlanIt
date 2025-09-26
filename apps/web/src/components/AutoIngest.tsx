'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'

export function AutoIngest() {
  const { data: session, status } = useSession()
  const hasTriggered = useRef(false)

  useEffect(() => {
    // Only trigger once per session and only when authenticated
    if (status === 'authenticated' && session?.user && !hasTriggered.current) {
      hasTriggered.current = true
      
      // Trigger auto-ingestion in background
      fetch('/api/auto-ingest', { method: 'GET' })
        .then(response => response.json())
        .then(data => {
          if (data.ok && data.tasksCreated > 0) {
            console.log(`📧 Auto-ingested Gmail: ${data.tasksCreated} new tasks created`)
          }
        })
        .catch(error => {
          console.log('Auto-ingest skipped:', error.message)
        })
    }
  }, [session, status])

  // This component renders nothing
  return null
}

// Hook for manual triggering of auto-ingest
export function useAutoIngest() {
  const triggerIngest = async () => {
    try {
      const response = await fetch('/api/auto-ingest', { method: 'GET' })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to trigger auto-ingest:', error)
      return { ok: false, error: 'Failed to trigger ingestion' }
    }
  }

  return { triggerIngest }
}
