import { type PlannerAction } from './registry'
import { Button } from '@/components/ui/Button'

export function ActionButton({ action }: { action: PlannerAction }) {
  const Icon = action.icon
  return (
    <Button size="sm" onClick={() => action.run()}>
      {Icon ? <Icon className="h-4 w-4 mr-1" /> : null}
      {action.label}
    </Button>
  )
}


