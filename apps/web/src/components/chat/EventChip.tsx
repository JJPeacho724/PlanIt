import { Button } from '@/components/ui/Button'

export function EventChip({ title, startsAt, endsAt, onAdd, onEdit, meta }:{
  title: string
  startsAt: string
  endsAt: string
  onAdd: () => void
  onEdit: () => void
  meta?: { overlap?: boolean }
}) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const time = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2 shadow-sm bg-surface/50">
      <div className="text-sm">
        <div className="font-medium">{title}</div>
        <div className="text-xs opacity-70">
          {time} · {minutes} min {meta?.overlap ? <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Overlaps (stackable)</span> : null}
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
        <Button size="sm" onClick={onAdd}>Add</Button>
      </div>
    </div>
  )
}


