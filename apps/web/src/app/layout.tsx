import './globals.css'
import { ReactNode } from 'react'
import { PlannerSidebar } from '@/components/PlannerSidebar'

export const metadata = {
  title: 'Planner Agent',
  description: 'AI-assisted planning with timeline',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-screen">
          <main className="p-4 lg:p-6">{children}</main>
          <aside className="border-l bg-muted/30 p-4 lg:p-6">
            <PlannerSidebar />
          </aside>
        </div>
      </body>
    </html>
  )
}

