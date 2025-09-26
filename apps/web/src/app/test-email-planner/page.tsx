'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TestEmailPlannerPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to main page since AI day planner is now integrated into the sidebar
    router.replace('/')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Redirecting...
        </h1>
        <p className="text-gray-600">
          AI Day Planner is now integrated into the main interface sidebar.
        </p>
      </div>
    </div>
  )
}