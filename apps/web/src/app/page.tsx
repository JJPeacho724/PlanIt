'use client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useState } from 'react'

export default function HomePage() {
  const [events, setEvents] = useState<any[]>([])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <a className="text-sm underline" href="/settings/connections">Connections</a>
      </div>
      <div className="rounded-md border p-2">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          selectable
          editable
          events={events}
          dateClick={(info) => {
            const title = prompt('Event Title?')
            if (title) setEvents((prev) => [...prev, { title, start: info.date, allDay: info.allDay }])
          }}
        />
      </div>
    </div>
  )
}

