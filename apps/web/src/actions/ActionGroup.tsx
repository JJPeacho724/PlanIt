import { ActionButton } from './ActionButton'
import { getVisibleActions } from './useActions'
import type { Placement } from './registry'

export function ActionGroup({ area, mounted }: { area: Placement; mounted: Set<Placement> }) {
  const items = getVisibleActions(area, mounted)
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <ActionButton key={a.id} action={a} />
      ))}
    </div>
  )
}


