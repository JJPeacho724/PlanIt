'use client'
import { createContext, useContext, useRef, useEffect } from 'react'
import type { Placement } from '@/actions/registry'

const Ctx = createContext<Set<Placement> | null>(null)

export function AreasProvider({ children }: { children: React.ReactNode }) {
  const setRef = useRef(new Set<Placement>())
  return <Ctx.Provider value={setRef.current}>{children}</Ctx.Provider>
}

export function useAreas() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('AreasProvider missing')
  return ctx
}

export function useRegisterArea(area: Placement) {
  const set = useAreas()
  useEffect(() => {
    set.add(area)
    return () => {
      set.delete(area)
    }
  }, [set, area])
}


