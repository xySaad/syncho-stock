'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { login, setAuth } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ login: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await login(form.login, form.password)
      const { token, user } = res.data
      setAuth(token, user)
      toast.success(`Welcome, ${user.login}`)
      const roleMap: Record<string, string> = {
        worker: '/worker',
        inventory_accountant: '/accountant',
        supervisor: '/supervisor',
      }
      router.push(roleMap[user.role] || '/')
    } catch {
      toast.error('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--paper)' }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex w-1/2 flex-col justify-between p-14"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        <div>
          <div className="mono text-xs tracking-widest uppercase mb-16" style={{ color: 'var(--muted)' }}>
            SYNCHO STOCK · v2.0
          </div>
          <h1 className="text-6xl font-light leading-tight mb-6">
            Syncho<br />
            <span style={{ color: 'var(--accent)' }}>Stock</span><br />
            Management
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: 380 }} className="text-lg leading-relaxed">
            Scan receipts with AI vision, manage commands, and get intelligent stock recommendations — all in one place.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px" style={{ border: '1px solid #222', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { role: 'Worker', desc: 'Scan & validate' },
            { role: 'Accountant', desc: 'Reports & analysis' },
            { role: 'Supervisor', desc: 'Full control + AI' },
          ].map((item) => (
            <div key={item.role} className="p-5" style={{ background: '#111' }}>
              <div className="mono text-xs mb-1" style={{ color: 'var(--accent)' }}>{item.role}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm fade-up">
          <div className="lg:hidden mono text-xs tracking-widest uppercase mb-10" style={{ color: 'var(--muted)' }}>
            SYNCHO STOCK · v2.0
          </div>

          <h2 className="text-3xl font-semibold mb-2">Sign in</h2>
          <p className="text-sm mb-10" style={{ color: 'var(--muted)' }}>
            Default password: <span className="mono font-medium">admin123</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mono text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--muted)' }}>
                Login
              </label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                placeholder="admin / worker1 / accountant1"
                required
                className="w-full px-4 py-3 text-sm rounded outline-none transition-all"
                style={{
                  background: '#fff',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            <div>
              <label className="mono text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--muted)' }}>
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 text-sm rounded outline-none transition-all"
                style={{
                  background: '#fff',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-sm font-semibold rounded transition-opacity"
              style={{
                background: loading ? 'var(--muted)' : 'var(--ink)',
                color: 'var(--paper)',
                marginTop: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in →'}
            </button>
          </form>

          <div className="mt-10 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Demo accounts available. Contact your supervisor to create new users.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
