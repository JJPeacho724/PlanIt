import { cn } from '@/lib/utils'

export function EventChip({ title, time }: { title: string; time: string }) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 text-sm shadow-soft border',
        'bg-gradient-to-r from-accent-50 to-white/80 dark:from-accent-800/30 dark:to-transparent',
        'border-accent-200/60 dark:border-accent-700/30'
      )}
    >
      <div className="font-medium">{title}</div>
      <div className="text-xs text-neutral-500">{time}</div>
    </div>
  )
}


