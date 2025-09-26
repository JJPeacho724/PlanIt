'use client'

import { PersonalizedPlanner } from '@/components/PersonalizedPlanner'
import { LearningProgress } from '@/components/LearningProgress'

export default function TestLearningPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🧠 Personalized Planner Test
          </h1>
          <p className="text-lg text-gray-600">
            Test the learning-enabled AI planner with feedback capabilities
          </p>
        </div>

        {/* Main Planner Component */}
        <div className="mb-12">
          <PersonalizedPlanner />
        </div>

        {/* Learning Progress Dashboard */}
        <div className="mb-8">
          <LearningProgress />
        </div>

        {/* Quick Test Panel */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">🧪 Quick Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <button 
              onClick={() => {
                fetch('/api/signals', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    key: 'test_signal',
                    signal: 'ui_test',
                    success: true
                  })
                }).then(r => r.json()).then(data => {
                  alert(data.success ? '✅ Signal recorded!' : '❌ Signal failed')
                })
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Test Signal Recording
            </button>

            <button 
              onClick={() => {
                fetch('/api/memory', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    remember: {
                      factType: 'preference',
                      key: 'ui_test',
                      value: 'button_clicked',
                      confidence: 0.8
                    }
                  })
                }).then(r => r.json()).then(data => {
                  alert(data.success ? '✅ Memory stored!' : '❌ Memory failed')
                })
              }}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Test Memory Storage
            </button>

            <button 
              onClick={() => {
                fetch('/api/test-planner', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: 'UI test message'
                  })
                }).then(r => r.json()).then(data => {
                  alert(data.success ? '✅ Test planner works!' : '❌ Test failed')
                })
              }}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              Test Basic Planner
            </button>
          </div>
        </div>

        {/* API Status */}
        <div className="mt-8 bg-gray-100 rounded-lg p-4">
          <h3 className="font-semibold mb-2">🔗 API Endpoints Available:</h3>
          <ul className="text-sm space-y-1">
            <li>✅ <code>/api/planner</code> - Enhanced AI planner with learning</li>
            <li>✅ <code>/api/signals</code> - Record user behavior signals</li>
            <li>✅ <code>/api/memory</code> - Store user preferences and facts</li>
            <li>✅ <code>/api/test-planner</code> - Simple test endpoint</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
