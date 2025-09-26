'use client'

import React from 'react'
import EventRow, { EventRowData } from './EventRow'

export type EventsGroup = {
  date: string
  label: string
  items: (EventRowData & { id: string })[]
}

export default function EventsList({
  groups,
  onAccept,
  onMaybe,
  onDecline,
  selectedIds,
  onToggle,
}: {
  groups: EventsGroup[]
  onAccept: (id: string) => void
  onMaybe: (id: string) => void
  onDecline: (id: string) => void
  selectedIds: Set<string>
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <section className="flex-1">
      {groups.map((g) => (
        <div key={g.date}>
          <h4 className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-3 py-1 text-xs font-medium border-b">{g.label}</h4>
          <ul>
            {g.items.map((ev) => (
              <EventRow
                key={ev.id}
                {...ev}
                disableActions={('canAct' in ev) ? (ev as any).canAct === false : false}
                selected={selectedIds.has(ev.id)}
                onSelectChange={(checked) => onToggle(ev.id, checked)}
                onAccept={() => onAccept(ev.id)}
                onMaybe={() => onMaybe(ev.id)}
                onDecline={() => onDecline(ev.id)}
              />)
            )}
          </ul>
        </div>
      ))}
    </section>
  )
}


