'use client'

import React from 'react'

export type EventRowData = {
  id: string
  title: string
  whenLabel: string
  isConflict?: boolean
  needsRsvp?: boolean
  disableActions?: boolean
}

export type EventRowProps = EventRowData & {
  selected?: boolean
  onSelectChange?: (checked: boolean) => void
  onAccept?: () => void
  onMaybe?: () => void
  onDecline?: () => void
  onDelete?: () => void
  canDelete?: boolean
}

export default function EventRow({
  title,
  whenLabel,
  isConflict,
  needsRsvp,
  disableActions,
  selected,
  onSelectChange,
  onAccept,
  onMaybe,
  onDecline,
  onDelete,
  canDelete,
}: EventRowProps) {
  return (
    <li className="group grid grid-cols-[24px_1fr_auto] items-start gap-3 px-3 py-2 border-b overflow-hidden">
      <input
        type="checkbox"
        className="size-4 mt-1 flex-shrink-0"
        checked={!!selected}
        onChange={(e) => onSelectChange?.(e.target.checked)}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-baseline gap-2 mb-1">
          <span
            className="flex-1 min-w-0 font-medium text-sm leading-tight whitespace-normal break-words"
            title={title}
          >
            {title}
          </span>
          {isConflict && <span className="rounded-full px-1 text-xs border border-red-300 text-red-700 whitespace-nowrap flex-shrink-0">conflict</span>}
          {needsRsvp && <span className="rounded-full px-1 text-xs border whitespace-nowrap flex-shrink-0">invite</span>}
        </div>
        <p className="text-xs text-muted-foreground whitespace-normal break-words" title={whenLabel}>{whenLabel}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
        {!disableActions && (
          <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
            {onAccept && <button title="Accept" onClick={onAccept} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Accept</button>}
            {onMaybe && <button title="Maybe" onClick={onMaybe} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Maybe</button>}
            {onDecline && <button title="Decline" onClick={onDecline} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Decline</button>}
            {canDelete && onDelete && <button title="Delete" onClick={onDelete} className="px-1 py-0.5 text-xs rounded hover:bg-red-100 text-red-700 whitespace-nowrap">Delete</button>}
          </div>
        )}
      </div>
    </li>
  )
}


