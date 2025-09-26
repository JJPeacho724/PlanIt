'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import VirtualizedList from '@/components/VirtualizedList'
import EmailRow from '@/components/EmailRow'

type Email = {
	id: string
	fromName: string
	fromEmail: string
	subject: string
	snippet?: string
	dateISO: string
	included: boolean
}

type Category = 'people' | 'recruiters' | 'receipts' | 'promotions' | 'all'

export default function EmailPanelV2({
	emails,
	onUpdate,
}: { emails: Email[]; onUpdate: (ids: string[], change: Partial<Pick<Email, 'included'>>) => void }) {
	console.log('📧 EmailPanelV2 rendering with', emails.length, 'emails')
	console.log('📧 First email in EmailPanelV2:', emails[0])
	
	const [cat, setCat] = useState<Category>('all')
	const [scope, setScope] = useState<'summary' | 'subject'>('summary')
	const [include, setInclude] = useState<'any' | 'included' | 'excluded'>('any')
	const [q, setQ] = useState('')
	const [sel, setSel] = useState<Set<string>>(new Set())

	// categorization + counts
	const categorized = useMemo(() => emails.map((e) => ({ e, cat: categorizeEmail(e) })), [emails])
	const counts = useMemo(() => {
		const base: Record<Category, number> = { people: 0, recruiters: 0, receipts: 0, promotions: 0, all: emails.length }
		for (const x of categorized) base[x.cat]++
		return base
	}, [categorized, emails.length])

	// filtering + sorting
	const filtered = useMemo(() => {
		let list = cat === 'all' ? categorized : categorized.filter((x) => x.cat === cat)
		if (include !== 'any') list = list.filter((x) => (include === 'included' ? x.e.included : !x.e.included))
		const term = q.trim().toLowerCase()
		let mapped = list.map((x) => x.e)
		if (term) {
			mapped = mapped.filter((e) => (
				(e.subject + ' ' + (e.snippet || '') + ' ' + e.fromName + ' ' + e.fromEmail).toLowerCase().includes(term)
			))
		}
		const result = mapped.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime())
		console.log('🔍 EmailPanelV2 filtered results:', {
			totalEmails: emails.length,
			categorized: categorized.length,
			afterCategoryFilter: list.length,
			afterIncludeFilter: list.length,
			afterSearch: mapped.length,
			finalFiltered: result.length,
			category: cat,
			includeFilter: include,
			searchTerm: q
		})
		return result
	}, [categorized, cat, include, q, emails.length])

	// selection helpers
	const toggle = (id: string) =>
		setSel((prev) => {
			const n = new Set(prev)
			n.has(id) ? n.delete(id) : n.add(id)
			return n
		})
	const clearSel = () => setSel(new Set())
	const selectAllVisible = () => setSel(new Set(filtered.map((e) => e.id)))

	// keyboard shortcuts
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') clearSel()
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
				e.preventDefault()
				selectAllVisible()
			}
			if (sel.size === 0) return
			if (e.key.toLowerCase() === 'e') onUpdate([...sel], { included: false })
			if (e.key.toLowerCase() === 'i') onUpdate([...sel], { included: true })
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [sel, filtered.length])

	return (
		<div className="flex h-full flex-col">
			{/* Controls */}
			<div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
				<div className="px-3 py-2 space-y-2">
					{/* Category filters */}
					<div className="flex items-center gap-1 overflow-x-auto">
						<div className="inline-flex rounded-md border p-0.5 flex-shrink-0">
							{(['all', 'people', 'recruiters', 'receipts', 'promotions'] as Category[]).map((x) => (
								<Button key={x} size="sm" variant={cat === x ? 'default' : 'ghost'} className="px-1.5 text-xs whitespace-nowrap" onClick={() => setCat(x)}>
									{label(x)}{x !== 'all' && <span className="ml-1 text-xs opacity-70">({counts[x]})</span>}
								</Button>
							))}
						</div>
					</div>
					
					{/* View and filter controls */}
					<div className="flex items-center gap-2 justify-between">
						<div className="flex items-center gap-2 flex-shrink-0">
							<div className="inline-flex rounded-md border p-0.5">
								<Button size="sm" variant={scope === 'summary' ? 'default' : 'ghost'} className="px-2 text-xs" onClick={() => setScope('summary')}>
									Summary
								</Button>
								<Button size="sm" variant={scope === 'subject' ? 'default' : 'ghost'} className="px-2 text-xs" onClick={() => setScope('subject')}>
									Subject
								</Button>
							</div>
							<div className="inline-flex rounded-md border p-0.5">
								<Button size="sm" variant={include === 'any' ? 'default' : 'ghost'} className="px-2 text-xs" onClick={() => setInclude('any')}>
									Any
								</Button>
								<Button size="sm" variant={include === 'included' ? 'default' : 'ghost'} className="px-2 text-xs" onClick={() => setInclude('included')}>
									Inc
								</Button>
								<Button size="sm" variant={include === 'excluded' ? 'default' : 'ghost'} className="px-2 text-xs" onClick={() => setInclude('excluded')}>
									Exc
								</Button>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 min-w-0 flex-1 max-w-[120px]" />
							<Button size="sm" variant="ghost" className="px-2 text-xs" onClick={selectAllVisible}>
								Select All
							</Button>
							<Button size="sm" variant="ghost" className="px-2 text-xs" onClick={clearSel}>
								Clear
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="px-3 py-1 text-xs text-muted-foreground">Showing {filtered.length} emails</div>

			{/* List */}
			{filtered.length === 0 ? (
				<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
					No emails match the current filters.
				</div>
			) : (
				<div className="flex-1 min-h-0 pb-16">
					<VirtualizedList
						className="h-full"
						itemCount={filtered.length}
						estimatedItemSize={72}
						itemSize={(index: number) => {
							const e = filtered[index]
							const subjectLength = (e?.subject || '').length
							// One line ~56px, two lines ~80px. Use a simple heuristic by length.
							return subjectLength > 55 ? 82 : 56
						}}
						itemData={{ filtered, sel, scope }}
						renderRow={({ index, data }) => {
							const e = data.filtered[index] as Email
							return (
								<EmailRow
									id={e.id}
									subject={e.subject}
									snippet={scope === 'summary' ? e.snippet : undefined}
									unread={!e.included}
									fromPretty={e.fromName}
									domain={(e.fromEmail || '').includes('@') ? (e.fromEmail || '').split('@')[1] : (e.fromEmail || '')}
									shortDate={new Date(e.dateISO).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
									selected={sel.has(e.id)}
									onSelectChange={() => toggle(e.id)}
									onArchive={() => onUpdate([e.id], { included: false })}
									onDefer={() => onUpdate([e.id], { included: false })}
									onMakeTask={() => onUpdate([e.id], { included: true })}
								/>
							)
						}}
					/>
				</div>
			)}

			{/* Bulk bar */}
			{sel.size > 0 && (
				<div className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-md px-3 py-2 flex items-center justify-between">
					<div className="text-sm">{sel.size} selected</div>
					<div className="flex gap-2">
						<Button size="sm" onClick={() => onUpdate([...sel], { included: true })}>
							Include
						</Button>
						<Button size="sm" variant="outline" onClick={() => onUpdate([...sel], { included: false })}>
							Exclude
						</Button>
						<Button size="sm" variant="ghost" onClick={clearSel}>
							Clear
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

function categorizeEmail(e: Email): Category {
	const safeFrom = (e.fromEmail || '').toString()
	const d = safeFrom.includes('@') ? (safeFrom.split('@')[1] || '') : safeFrom
	const subject = (e.subject || '').toString().toLowerCase()
	const promoDomains = ['news.bloomberg', 'mcafee.com', 'email.uniqlo.com', 'email.gasbuddy.com']
	const ats = /receipt|invoice|order|payment|confirm|thanks/i.test(subject)
	const rec = /(recruit|interview|application|careers|workday|greenhouse|lever|smartrecruiters)/i.test(subject + ' ' + d)
	const promo = promoDomains.some((x) => d.includes(x)) || /(newsletter|sale|deal|save|% off|offer)/i.test(subject)
	if (rec) return 'recruiters'
	if (ats) return 'receipts'
	if (promo) return 'promotions'
	return 'people'
}

function label(c: Category) {
	return c === 'people'
		? 'People'
		: c === 'recruiters'
		? 'Recruiters'
		: c === 'receipts'
		? 'Receipts'
		: c === 'promotions'
		? 'Promotions'
		: 'All'
}


