'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import EventsList from '@/components/EventsList'

type EventItem = {
	id: string
	title: string
	startISO?: string
	whenLabel: string
	status: 'pending' | 'confirmed'
	confidence?: number
	canAct?: boolean
}

export default function EventsPanelV2({
	events,
	onAction,
}: { events: EventItem[]; onAction: (ids: string[], action: 'accept' | 'reject' | 'snooze' | 'delete') => void }) {
	const [tab, setTab] = useState<'pending' | 'all'>('pending')
	const [q, setQ] = useState('')
	const [sel, setSel] = useState<Set<string>>(new Set())

	const filtered = useMemo(() => {
		const base = tab === 'pending' ? events.filter((e) => e.status === 'pending') : events
		if (!q) return base
		const term = q.toLowerCase()
		return base.filter((e) => (e.title + ' ' + (e.whenLabel || '')).toLowerCase().includes(term))
	}, [events, tab, q])

	const actionableIds = useMemo(() => new Set(filtered.filter(e => e.canAct !== false).map(e => e.id)), [filtered])

	const toggle = (id: string) =>
		setSel((prev) => {
			if (!actionableIds.has(id)) return prev
			const n = new Set(prev)
			n.has(id) ? n.delete(id) : n.add(id)
			return n
		})

	// shortcuts
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setSel(new Set())
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
				e.preventDefault()
				setSel(new Set(filtered.filter((x) => x.canAct !== false).map((x) => x.id)))
			}
			if (!sel.size) return
			if (e.key.toLowerCase() === 'a') onAction([...sel], 'accept')
			if (e.key.toLowerCase() === 'r') onAction([...sel], 'reject')
			if (e.key.toLowerCase() === 's') onAction([...sel], 'snooze')
			if (e.key.toLowerCase() === 'd') onAction([...sel], 'delete')
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [sel, filtered.length])

	return (
		<div className="flex h-full flex-col">
			{/* Controls */}
			<div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
				<div className="px-3 py-2 space-y-2">
					{/* Status filters are provided by parent RightSidebar; omit here */}
					
					{/* Search */}
					<div className="flex items-center justify-end gap-2">
						<Input placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 min-w-0 flex-1 max-w-[180px]" />
						<Button size="sm" variant="ghost" className="px-2 text-xs" onClick={() => setSel(new Set(filtered.filter((x) => x.canAct !== false).map((x) => x.id)))}>
							Select All
						</Button>
						<Button size="sm" variant="ghost" className="px-2 text-xs" onClick={() => setSel(new Set())}>
							Clear
						</Button>
					</div>
				</div>
			</div>

			<div className="px-3 py-1 text-xs text-muted-foreground">Showing {filtered.length} events</div>

			{/* List */}
			{filtered.length === 0 ? (
				<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
					No events match the current filters.
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-auto pb-16">
					<EventsList
						groups={groupByDay(filtered)}
						selectedIds={sel}
						onToggle={(id, checked) => setSel(prev => {
							const n = new Set(prev)
							if (checked) n.add(id); else n.delete(id)
							return n
						})}
						onAccept={(id) => onAction([id], 'accept')}
						onMaybe={(id) => onAction([id], 'snooze')}
						onDecline={(id) => onAction([id], 'reject')}
						onDelete={(id) => onAction([id], 'delete')}
						canDelete={true}
					/>
				</div>
			)}

			{sel.size > 0 && (
				<div className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-md px-3 py-2 flex items-center justify-between">
					<div className="text-sm">{sel.size} selected</div>
					<div className="flex gap-2">
						<Button size="sm" onClick={() => onAction([...sel], 'accept')}>Accept</Button>
						<Button size="sm" variant="destructive" onClick={() => onAction([...sel], 'reject')}>
							Reject
						</Button>
						<Button size="sm" variant="outline" onClick={() => onAction([...sel], 'snooze')}>
							Snooze
						</Button>
						<Button size="sm" variant="destructive" onClick={() => onAction([...sel], 'delete')}>
							Delete
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

function groupByDay(list: EventItem[]) {
	const groups: { date: string; label: string; items: { id: string; title: string; whenLabel: string }[] }[] = []
	const map = new Map<string, { date: string; label: string; items: { id: string; title: string; whenLabel: string }[] }>()
	for (const ev of list) {
		const d = ev.startISO ? new Date(ev.startISO) : new Date()
		const key = d.toISOString().slice(0, 10)
		if (!map.has(key)) {
			map.set(key, { date: key, label: relativeLabel(d), items: [] })
		}
		map.get(key)!.items.push({ id: ev.id, title: ev.title, whenLabel: ev.whenLabel })
	}
	for (const g of map.values()) groups.push(g)
	groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
	return groups
}

function relativeLabel(date: Date) {
	const today = new Date()
	const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate())
	const diff = Math.round((d1.getTime() - d0.getTime()) / (24 * 3600 * 1000))
	if (diff === 0) return 'Today'
	if (diff === 1) return 'Tomorrow'
	if (diff < 7 && diff > 1) return date.toLocaleDateString(undefined, { weekday: 'long' })
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}


