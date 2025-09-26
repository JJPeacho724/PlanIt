import { actions, type PlannerAction, type Placement } from './registry'

export function getVisibleActions(area: Placement, mounted: Set<Placement>): PlannerAction[] {
  const candidates = actions.filter((a) => a.placements.includes(area))
  return candidates.filter((a) => {
    if (a.primary === area) return true
    if (mounted.has(a.primary)) return false
    return a.secondary?.includes(area) ?? false
  })
}


