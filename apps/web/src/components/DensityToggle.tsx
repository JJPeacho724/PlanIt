'use client'

import React, { useEffect, useState } from 'react'

type Density = 'comfortable' | 'cozy' | 'compact'

const STORAGE_KEY = 'ui-density'

export function DensityToggle() {
  const [density, setDensity] = useState<Density>('comfortable')

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) as Density | null
    if (saved === 'comfortable' || saved === 'cozy' || saved === 'compact') {
      setDensity(saved)
      document.body.classList.remove('density-comfortable', 'density-cozy', 'density-compact')
      document.body.classList.add(`density-${saved}`)
    } else {
      document.body.classList.add('density-comfortable')
    }
  }, [])

  const applyDensity = (value: Density) => {
    setDensity(value)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value)
    }
    document.body.classList.remove('density-comfortable', 'density-cozy', 'density-compact')
    document.body.classList.add(`density-${value}`)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border px-1 py-0.5 text-xs">
      <button
        type="button"
        onClick={() => applyDensity('comfortable')}
        className={`px-2 py-1 rounded ${density === 'comfortable' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
      >Comfortable</button>
      <button
        type="button"
        onClick={() => applyDensity('cozy')}
        className={`px-2 py-1 rounded ${density === 'cozy' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
      >Cozy</button>
      <button
        type="button"
        onClick={() => applyDensity('compact')}
        className={`px-2 py-1 rounded ${density === 'compact' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
      >Compact</button>
    </div>
  )
}


