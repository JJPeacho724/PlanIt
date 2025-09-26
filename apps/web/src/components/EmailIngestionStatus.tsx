'use client'
import { useState, useEffect } from 'react'
import { Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface IngestionStatus {
  lastFetchedAt: string | null
  isConnected: boolean
  totalEmails: number
  recentTasks: number
}

export function EmailIngestionStatus() {
  const [status, setStatus] = useState<IngestionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/ingest/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch ingestion status:', error)
    } finally {
      setLoading(false)
    }
  }

  const triggerIngestion = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/auto-ingest', { method: 'POST' })
      if (response.ok) {
        // Refresh status after triggering ingestion
        setTimeout(() => fetchStatus(), 2000)
        
        // Trigger a custom event to refresh email and events panels
        window.dispatchEvent(new CustomEvent('emailIngestionComplete'))
      }
    } catch (error) {
      console.error('Failed to trigger ingestion:', error)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading email status...</span>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <AlertCircle className="h-4 w-4" />
        <span>Email status unavailable</span>
      </div>
    )
  }

  const formatLastIngestion = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString()
  }

  const getStatusIcon = () => {
    if (!status.isConnected) {
      return <AlertCircle className="h-4 w-4 text-red-500" />
    }
    
    if (!status.lastFetchedAt) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
    
    const lastFetch = new Date(status.lastFetchedAt)
    const now = new Date()
    const diffHours = (now.getTime() - lastFetch.getTime()) / (1000 * 60 * 60)
    
    if (diffHours > 24) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
    
    return <CheckCircle className="h-4 w-4 text-green-500" />
  }

  const getStatusText = () => {
    if (!status.isConnected) {
      return 'Gmail not connected'
    }
    
    if (!status.lastFetchedAt) {
      return 'No emails ingested yet'
    }
    
    return `Last sync: ${formatLastIngestion(status.lastFetchedAt)}`
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-text-muted">{getStatusText()}</span>
      </div>
      
      {status.isConnected && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>{status.totalEmails} emails</span>
          <span>•</span>
          <span>{status.recentTasks} tasks</span>
        </div>
      )}
      
      {status.isConnected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={triggerIngestion}
          disabled={refreshing}
          className="h-6 px-2 text-xs"
        >
          {refreshing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  )
}
