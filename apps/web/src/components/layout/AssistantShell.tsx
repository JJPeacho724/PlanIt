'use client'

import React from 'react'

type AssistantShellProps = {
  left?: React.ReactNode
  list: React.ReactNode
  preview?: React.ReactNode
}

export default function AssistantShell({ left, list, preview }: AssistantShellProps) {
  return (
    <div className="grid h-full gap-4 lg:grid-cols-[240px_minmax(0,1fr)_420px] grid-cols-1">
      <aside className="hidden lg:block min-h-0">{left}</aside>
      <main className="min-h-0">{list}</main>
      <aside className="hidden lg:block min-h-0">{preview}</aside>
    </div>
  )
}


