"use client"
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAreas } from '@/layout/AreaContext'
import { actions } from '@/actions/registry'

export function FAB() {
  const mounted = useAreas()
  const plan = actions.find((a) => a.id === 'plan-day')!
  const railMounted = mounted.has('rail')
  if (railMounted) return null
  return (
    <Button onClick={() => plan.run()} className="fixed bottom-6 right-6 rounded-full shadow-card">
      <Sparkles className="h-4 w-4 mr-2" /> {plan.label}
    </Button>
  )
}


