'use client'
import { useState } from 'react'
import { Calendar, Bot, Search } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface HeaderBarProps {
  view: 'month' | 'week' | 'day'
  onViewChange: (v: 'month' | 'week' | 'day') => void
  onToday: () => void
  onOpenCopilot: () => void
  learningPct?: number
}

export function HeaderBar({
  view,
  onViewChange,
  onToday,
  onOpenCopilot,
  learningPct = 30,
}: HeaderBarProps) {
  const [cmdOpen, setCmdOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 bg-white/70 dark:bg-black/40 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-accent-600" />
          <span className="font-semibold">planit</span>
        </div>

        <SegmentedControl
          className="ml-4"
          value={view}
          onChange={(v) => onViewChange(v as HeaderBarProps['view'])}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'day', label: 'Day' },
          ]}
        />

        <Button variant="outline" size="sm" onClick={onToday} className="ml-2 rounded-full">
          Today
        </Button>

        <div className="ml-auto hidden md:flex items-center gap-2">
          <div className="relative">
            <input
              onFocus={() => setCmdOpen(true)}
              placeholder="Search (⌘K)"
              className={cn(
                'pl-9 w-64 h-9 rounded-md border border-border bg-white/80 dark:bg-black/30',
                'placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-ring'
              )}
            />
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-neutral-500" />
          </div>

          <Button onClick={onOpenCopilot} className="rounded-full">
            <Bot className="h-4 w-4 mr-2" /> Copilot
          </Button>
        </div>
      </div>

      {cmdOpen && (
        <div className="absolute inset-x-0 top-16 mx-auto max-w-xl">
          <div className="card-glass rounded-2xl p-2 border">
            {/* Command palette scaffold */}
            <input
              autoFocus
              placeholder="Type to search…"
              className="w-full h-10 rounded-md border border-border bg-white/80 dark:bg-black/30 px-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </header>
  )
}


