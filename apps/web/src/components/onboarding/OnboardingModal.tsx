import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

export function OnboardingModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [tz, setTz] = useState('America/New_York')
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('17:00')
  const [meetingStart, setMeetingStart] = useState('10:00')
  const [meetingEnd, setMeetingEnd] = useState('16:00')
  const [gap, setGap] = useState(15)
  const [cap, setCap] = useState(3)
  const [allowedDomains, setAllowedDomains] = useState('uchicago.edu')
  const [ignoreDomains, setIgnoreDomains] = useState('mailchimp.com, mcafee.com')
  const [ignoreKeywords, setIgnoreKeywords] = useState('save %, newsletter, promotion, user study')
  const [requireMeetingLink, setRequireMeetingLink] = useState(true)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/preferences')
        if (res.ok) {
          const data = await res.json()
          const p = data.preferences || {}
          setTz(data.timeZone || tz)
          setWorkStart(p?.planning?.workHours?.start || workStart)
          setWorkEnd(p?.planning?.workHours?.end || workEnd)
          setMeetingStart(p?.planning?.meetingHours?.start || meetingStart)
          setMeetingEnd(p?.planning?.meetingHours?.end || meetingEnd)
          setGap(p?.planning?.minGapMinutes || gap)
          setCap(p?.planning?.eventCapPerDay || cap)
          setAllowedDomains((p?.gating?.allowedDomains || ['uchicago.edu']).join(', '))
          setIgnoreDomains((p?.gating?.ignoreDomains || ['mailchimp.com', 'mcafee.com']).join(', '))
          setIgnoreKeywords((p?.gating?.ignoreKeywords || ['save %', 'newsletter', 'promotion', 'user study']).join(', '))
          setRequireMeetingLink(p?.gating?.requireMeetingLink ?? true)
        }
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function save() {
    setLoading(true)
    try {
      await fetch('/api/onboarding/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeZone: tz,
          planning: {
            workHours: { start: workStart, end: workEnd },
            meetingHours: { start: meetingStart, end: meetingEnd },
            minGapMinutes: Number(gap),
            eventCapPerDay: Number(cap)
          },
          gating: {
            allowedDomains: allowedDomains.split(',').map(s => s.trim()).filter(Boolean),
            ignoreDomains: ignoreDomains.split(',').map(s => s.trim()).filter(Boolean),
            ignoreKeywords: ignoreKeywords.split(',').map(s => s.trim()).filter(Boolean),
            requireMeetingLink
          }
        })
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null
  return (
    <div className={cn('fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4')}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg w-full max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Set your planning preferences</h2>
          <button onClick={onClose} className="text-sm opacity-70 hover:opacity-100">Close</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col text-sm gap-1">
            Time zone
            <input className="border rounded px-2 py-1" value={tz} onChange={e => setTz(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Event cap per day
            <input type="number" min={1} max={5} className="border rounded px-2 py-1" value={cap} onChange={e => setCap(Number(e.target.value))} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Work hours (start)
            <input className="border rounded px-2 py-1" value={workStart} onChange={e => setWorkStart(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Work hours (end)
            <input className="border rounded px-2 py-1" value={workEnd} onChange={e => setWorkEnd(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Meeting hours (start)
            <input className="border rounded px-2 py-1" value={meetingStart} onChange={e => setMeetingStart(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Meeting hours (end)
            <input className="border rounded px-2 py-1" value={meetingEnd} onChange={e => setMeetingEnd(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1">
            Minimum gap between events (minutes)
            <input type="number" min={10} className="border rounded px-2 py-1" value={gap} onChange={e => setGap(Number(e.target.value))} />
          </label>
          <label className="flex flex-col text-sm gap-1 col-span-full">
            Allowed domains (deadlines)
            <input className="border rounded px-2 py-1" value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1 col-span-full">
            Ignore domains
            <input className="border rounded px-2 py-1" value={ignoreDomains} onChange={e => setIgnoreDomains(e.target.value)} />
          </label>
          <label className="flex flex-col text-sm gap-1 col-span-full">
            Ignore keywords (comma-separated)
            <input className="border rounded px-2 py-1" value={ignoreKeywords} onChange={e => setIgnoreKeywords(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm col-span-full">
            <input type="checkbox" checked={requireMeetingLink} onChange={e => setRequireMeetingLink(e.target.checked)} />
            Require meeting link (.ics/Zoom/Meet/Teams) for email-sourced meetings
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 border rounded">Cancel</button>
          <button disabled={loading} onClick={save} className="px-3 py-1 bg-black text-white rounded disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}
