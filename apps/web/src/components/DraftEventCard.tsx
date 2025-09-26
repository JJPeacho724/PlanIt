import React from 'react'
import type { DraftEvent } from '@/utils/events/types'

export function DraftEventCard({ e, onAccept, onSkip, onOpen }: { e: DraftEvent; onAccept: (id: string) => void; onSkip: (id: string) => void; onOpen: (ref?: string) => void; }) {
  const start = new Date(e.startISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const end = new Date(e.endISO).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const meta: any = (e as any).meta || {}
  const specificity = typeof meta?.specificityScore === 'number' ? meta.specificityScore : undefined
  const deliverable = meta?.deliverable
  const resources: { title: string; url: string; why?: string }[] | undefined = meta?.resources
  const acceptance: string[] | undefined = deliverable?.acceptanceCriteria
  return (
    <div className="rounded-2xl border p-3 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium flex items-center gap-2">
            {e.title}
            {typeof specificity === 'number' && specificity < 0.7 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-200">Needs more specificity</span>
            ) : null}
          </div>
          <div className="text-sm text-gray-600">{start}–{end} {e.timezone.split('/')[1]} • {e.source}</div>
          <div className="text-xs text-gray-500 mt-1">Why: {e.reasons.slice(0, 3).join('; ')}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onAccept(e.id)} className="px-2 py-1 rounded-xl border">Accept</button>
          <button onClick={() => onSkip(e.id)} className="px-2 py-1 rounded-xl border">Skip</button>
          <button onClick={() => onOpen(e.sourceRef)} className="px-2 py-1 rounded-xl border">Open</button>
        </div>
      </div>
      {(deliverable || (resources && resources.length) || (acceptance && acceptance.length)) ? (
        <div className="mt-1 text-xs">
          {deliverable ? (
            <div className="text-gray-700">
              <span className="font-medium">Deliverable:</span> {deliverable.kind}
              {deliverable.pathHint ? <span> → {deliverable.pathHint}</span> : null}
            </div>
          ) : null}
          {acceptance && acceptance.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-gray-700">Acceptance criteria</summary>
              <ul className="list-disc ml-4 text-gray-700">
                {acceptance.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          ) : null}
          {resources && resources.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-gray-700">Resources ({Math.min(3, resources.length)})</summary>
              <ul className="list-disc ml-4 text-blue-700">
                {resources.slice(0, 3).map((r, i) => (
                  <li key={i}><a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{r.why ? <span className="text-gray-600"> — {r.why}</span> : null}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}



