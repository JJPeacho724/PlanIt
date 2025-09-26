import './globals.css'
import { ReactNode } from 'react'
import { MainNavigation } from '@/components/MainNavigation'
import Providers from '@/components/Providers'
import { AreasProvider } from '@/layout/AreaContext'
import { AutoIngest } from '@/components/AutoIngest'

export const metadata = {
  title: 'planit - Smart Calendar & Email Integration',
  description: 'Intelligent planning with seamless email integration and smart scheduling',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-inter bg-bg">
        <Providers>
          <AreasProvider>
          <AutoIngest />
          <div className="flex flex-col h-screen bg-bg overflow-hidden">
            {/* Main Navigation */}
            <MainNavigation />
            
            {/* AppShell will handle the layout and sidebar */}
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          </div>
          </AreasProvider>
        </Providers>
      </body>
    </html>
  )
}

