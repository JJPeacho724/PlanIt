"use client"
import { useEffect, useState } from 'react'

type Status = { google: boolean; slack: boolean } | null

export default function ConnectionsPage() {
  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const res = await fetch('/api/integrations/status', { cache: 'no-store' })
    if (res.ok) setStatus(await res.json())
  }

  useEffect(() => { void refresh() }, [])

  function connectGoogle() { window.location.href = '/api/integrations/connect/google' }
  function connectSlack() { window.location.href = '/api/integrations/connect/slack' }

  async function revoke(provider: 'GOOGLE' | 'SLACK') {
    setLoading(true)
    await fetch('/api/integrations/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
    setLoading(false)
    void refresh()
  }



  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Connections</h1>
          <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Google (Calendar + Gmail read)</div>
            <div className="text-sm text-muted-foreground">Scopes: Calendar, Gmail readonly</div>
          </div>
          {status?.google ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-green-600 text-sm font-medium">Connected</span>
                <div className="flex items-center gap-1 text-xs text-gray-500 bg-green-50 px-2 py-1 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Auto-sync active</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button disabled={loading} className="px-3 py-1 border rounded hover:bg-gray-50 transition-colors" onClick={connectGoogle}>Reauth</button>
                <button disabled={loading} className="px-3 py-1 border rounded hover:bg-gray-50 transition-colors" onClick={() => revoke('GOOGLE')}>Revoke</button>
              </div>
              <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                📧 <strong>Automatic Email Sync:</strong> Your emails are automatically ingested every 15-30 minutes. No manual action needed!
              </div>
            </div>
          ) : (
            <button className="px-3 py-1 border rounded" onClick={connectGoogle}>Connect</button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Slack (user token)</div>
            <div className="text-sm text-muted-foreground">Scopes: channels:history, groups:history, im:history, mpim:history, users:read</div>
          </div>
          {status?.slack ? (
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-sm">Connected</span>
              <button disabled={loading} className="px-3 py-1 border rounded" onClick={connectSlack}>Reauth</button>
              <button disabled={loading} className="px-3 py-1 border rounded" onClick={() => revoke('SLACK')}>Revoke</button>
            </div>
          ) : (
            <button className="px-3 py-1 border rounded" onClick={connectSlack}>Connect</button>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}

