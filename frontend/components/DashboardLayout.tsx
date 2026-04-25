'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getUser, logout } from '@/lib/api'
import { LogOut, Wifi, WifiOff } from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: string
}

interface DashboardLayoutProps {
  children: React.ReactNode
  navItems: NavItem[]
  title: string
  roleColor: string
  wsConnected?: boolean
}

export default function DashboardLayout({
  children,
  navItems,
  title,
  roleColor,
  wsConnected,
}: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<{ login: string; role: string } | null>(null)

  useEffect(() => {
    const u = getUser()
    if (!u) {
      router.push('/')
      return
    }
    setUser(u)
  }, [router])

  if (!user) return null

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--paper)' }}>
      {/* Sidebar */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          borderRight: '1px solid #1a1a1a',
        }}
      >
        {/* Logo */}
        <div className="px-6 pt-8 pb-6" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div className="mono text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>
            SYNCHO STOCK
          </div>
          <div className="text-lg font-semibold">{title}</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded text-sm text-left transition-all"
                style={{
                  background: active ? '#1e1e1e' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--muted)',
                  borderLeft: active ? `2px solid ${roleColor}` : '2px solid transparent',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-5" style={{ borderTop: '1px solid #1a1a1a' }}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center mono text-xs font-bold"
              style={{ background: roleColor, color: '#fff' }}
            >
              {user.login[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-medium">{user.login}</div>
              <div className="mono text-xs" style={{ color: 'var(--muted)' }}>
                {user.role.replace('_', ' ')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            {wsConnected !== undefined && (
              <div className="flex items-center gap-1.5">
                {wsConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#2A9D5C', display: 'inline-block' }} />
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={12} color="var(--muted)" />
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>Offline</span>
                  </>
                )}
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs transition-colors hover:text-red-400"
              style={{ color: 'var(--muted)' }}
            >
              <LogOut size={13} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
