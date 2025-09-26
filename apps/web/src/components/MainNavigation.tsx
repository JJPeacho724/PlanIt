'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Calendar, Settings, Mail, Sparkles, User, LogOut, LogIn } from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description?: string
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Calendar',
    icon: Calendar,
    description: 'View and manage your calendar events'
  },
  {
    href: '/settings/connections',
    label: 'Connections',
    icon: Settings,
    description: 'Manage integrations and connections'
  }
]

export function MainNavigation() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [showUserMenu, setShowUserMenu] = useState(false)

  return (
    <nav className="bg-bg border-b border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between h-12">
          {/* Left side - Logo and main nav */}
          <div className="flex">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center group">
                <span className="font-semibold text-sm text-text transition-colors">
                  planit
                </span>
              </Link>
            </div>

            {/* Main navigation */}
            <div className="hidden md:ml-10 md:flex md:space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 group h-8 ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-text-muted hover:text-text hover:bg-surface'
                    }`}
                    title={item.description}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-text-muted group-hover:text-text'}`} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Right side - Auth and user menu */}
          <div className="flex items-center gap-2">
            {/* Email sync status indicator */}
            {status === 'authenticated' && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted bg-surface px-2.5 py-1.5 rounded-md h-8">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <span>Sync active</span>
              </div>
            )}

            {/* Auth section */}
            {status === 'loading' ? (
              <div className="w-8 h-8 bg-surface rounded-md animate-pulse"></div>
            ) : session ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-1.5 text-sm text-text hover:text-text px-2.5 py-1.5 rounded-md hover:bg-surface transition-all h-8"
                >
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt="Profile"
                      className="w-6 h-6 rounded-md border border-border"
                    />
                  ) : (
                    <div className="w-6 h-6 bg-surface rounded-md flex items-center justify-center">
                      <User className="w-3 h-3 text-text-muted" />
                    </div>
                  )}
                  <span className="hidden sm:block font-medium">
                    {session.user?.name || session.user?.email}
                  </span>
                </button>

                {/* User dropdown menu */}
                {showUserMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowUserMenu(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-48 bg-bg rounded-md shadow-sm border border-border z-20">
                      <div className="py-1">
                        <div className="px-4 py-2 text-sm text-text-muted border-b border-border">
                          Signed in as<br />
                          <span className="font-medium text-text">{session.user?.email}</span>
                        </div>
                        <Link
                          href="/settings/connections"
                          className="flex items-center px-4 py-2 text-sm text-text hover:bg-surface"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Settings
                        </Link>
                        <button
                          onClick={() => {
                            setShowUserMenu(false)
                            signOut()
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-text hover:bg-surface"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => signIn('google')}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-2.5 py-1.5 rounded-md transition-all font-medium text-sm h-8"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="md:hidden pb-3">
          <div className="flex space-x-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all h-8 ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-text-muted'}`} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
