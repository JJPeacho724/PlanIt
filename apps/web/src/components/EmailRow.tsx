'use client'

import React from 'react'

export type EmailRowData = {
  id: string
  subject: string
  snippet?: string
  unread?: boolean
  fromPretty?: string
  domain?: string
  shortDate: string
}

export type EmailRowProps = EmailRowData & {
  selected?: boolean
  onSelectChange?: (checked: boolean) => void
  onArchive?: () => void
  onDefer?: () => void
  onMakeTask?: () => void
}

export default function EmailRow({
  subject,
  snippet,
  unread,
  fromPretty,
  domain,
  shortDate,
  selected,
  onSelectChange,
  onArchive,
  onDefer,
  onMakeTask,
}: EmailRowProps) {
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
            className="flex-1 min-w-0 font-medium text-sm leading-tight truncate"
            title={subject}
          >
            {subject}
          </span>
          {unread && <span className="rounded-full px-1 text-xs border whitespace-nowrap flex-shrink-0">new</span>}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={`${fromPretty || ''}${fromPretty && domain ? ' • ' : ''}${domain || ''}`}>
          {fromPretty}{fromPretty && (domain ? ' • ' : '')}{domain}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-0">
        <time className="text-xs text-muted-foreground whitespace-nowrap">{shortDate}</time>
        <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
          <button title="Archive" onClick={onArchive} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Archive</button>
          <button title="Defer" onClick={onDefer} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Defer</button>
          <button title="Task" onClick={onMakeTask} className="px-1 py-0.5 text-xs rounded hover:bg-muted whitespace-nowrap">Task</button>
        </div>
      </div>
    </li>
  )
}


