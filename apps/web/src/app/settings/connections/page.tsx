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

  async function ingestGmail() {
    setLoading(true)
    await fetch('/api/integrations/gmail/ingest', { method: 'POST' })
    setLoading(false)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Connections</h1>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Google (Calendar + Gmail read)</div>
            <div className="text-sm text-muted-foreground">Scopes: Calendar, Gmail readonly</div>
          </div>
          {status?.google ? (
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-sm">Connected</span>
              <button disabled={loading} className="px-3 py-1 border rounded" onClick={connectGoogle}>Reauth</button>
              <button disabled={loading} className="px-3 py-1 border rounded" onClick={() => revoke('GOOGLE')}>Revoke</button>
              <button disabled={loading} className="px-3 py-1 border rounded" onClick={ingestGmail}>Ingest Gmail (30d)</button>
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
  )
}

