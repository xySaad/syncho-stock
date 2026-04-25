'use client'

import { useCallback, useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import {
  getStock, getReceipts, getCommands, createCommand,
  getRecommendation, getAnalysis, createWebSocket,
} from '@/lib/api'
import toast from 'react-hot-toast'
import { Plus, Loader2, RefreshCw, Sparkles, BarChart2, Package, ClipboardList, Receipt } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

type Tab = 'stock' | 'receipts' | 'commands' | 'recommend' | 'analysis'

interface Stock { id: number; name: string; quantity: number; last_updated: string }
interface ReceiptItem { id: number; name: string; quantity: number; price: number; supplier: string; date: string }
interface Command { id: number; name: string; quantity: number; price: number; date: string; status: string }

const NAV = [
  { label: 'Dashboard', href: '/supervisor', icon: '🏠' },
]

const STATUS_COLORS: Record<string, string> = {
  pending: '#E8A22E',
  validated: '#2A9D5C',
  rejected: '#E84C2E',
}

export default function SupervisorPage() {
  const [tab, setTab] = useState<Tab>('stock')
  const [stock, setStock] = useState<Stock[]>([])
  const [receipts, setReceipts] = useState<ReceiptItem[]>([])
  const [commands, setCommands] = useState<Command[]>([])
  const [recommendation, setRecommendation] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [loading, setLoading] = useState(false)

  // New command form
  const [showForm, setShowForm] = useState(false)
  const [cmdForm, setCmdForm] = useState({ name: '', quantity: '', price: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, c] = await Promise.all([getStock(), getReceipts(), getCommands()])
      setStock(s.data || [])
      setReceipts(r.data || [])
      setCommands(c.data || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string; data: unknown }
      if (msg.event === 'new_receipt') {
        setReceipts((prev) => [msg.data as ReceiptItem, ...prev])
        toast('🧾 New receipt scanned!')
      }
      if (msg.event === 'command_updated') {
        const updated = msg.data as { id: number; status: string }
        setCommands((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, status: updated.status } : c))
        )
      }
    })
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    return () => ws.close()
  }, [loadData])

  const handleCreateCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await createCommand({
        name: cmdForm.name,
        quantity: parseFloat(cmdForm.quantity),
        price: parseFloat(cmdForm.price),
      })
      setCommands((prev) => [res.data, ...prev])
      setCmdForm({ name: '', quantity: '', price: '' })
      setShowForm(false)
      toast.success('Command created!')
    } catch {
      toast.error('Failed to create command')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRecommendation = async () => {
    setAiLoading(true)
    try {
      const res = await getRecommendation()
      setRecommendation(res.data.recommendation)
    } catch {
      toast.error('AI request failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAnalysis = async () => {
    setAiLoading(true)
    try {
      const res = await getAnalysis()
      setAnalysis(res.data.analysis)
    } catch {
      toast.error('AI request failed')
    } finally {
      setAiLoading(false)
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stock', label: 'Stock', icon: <Package size={14} /> },
    { id: 'receipts', label: 'Receipts', icon: <Receipt size={14} /> },
    { id: 'commands', label: 'Commands', icon: <ClipboardList size={14} /> },
    { id: 'recommend', label: 'AI Recommend', icon: <Sparkles size={14} /> },
    { id: 'analysis', label: 'AI Analysis', icon: <BarChart2 size={14} /> },
  ]

  return (
    <DashboardLayout navItems={NAV} title="Supervisor" roleColor="#7C5CFC" wsConnected={wsConnected}>
      <div className="p-8 max-w-6xl mx-auto stagger">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-1">Supervisor Dashboard</h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Full inventory control with AI-powered insights.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="flex items-center gap-1.5 px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--border)', background: '#fff' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold"
              style={{ background: 'var(--ink)', color: '#fff' }}
            >
              <Plus size={14} /> New Command
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Stock Items', value: stock.length, color: '#7C5CFC' },
            { label: 'Total Receipts', value: receipts.length, color: '#2A9D5C' },
            { label: 'Commands', value: commands.length, color: '#E8A22E' },
            { label: 'Pending', value: commands.filter((c) => c.status === 'pending').length, color: '#E84C2E' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg p-5" style={{ background: '#fff', border: '1px solid var(--border)' }}>
              <div className="mono text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{kpi.label}</div>
              <div className="text-3xl font-semibold" style={{ color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: '#fff', border: '1px solid var(--border)', width: 'fit-content' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-all"
              style={{
                background: tab === t.id ? 'var(--ink)' : 'transparent',
                color: tab === t.id ? '#fff' : 'var(--muted)',
                fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="rounded-lg" style={{ background: '#fff', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {loading && (
            <div className="p-8 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded shimmer" />)}
            </div>
          )}

          {/* Stock Tab */}
          {!loading && tab === 'stock' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--paper)' }}>
                  {['Product', 'Quantity', 'Last Updated'].map((h) => (
                    <th key={h} className="mono text-xs px-6 py-4 text-left font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-12 text-sm" style={{ color: 'var(--muted)' }}>No stock items</td></tr>
                ) : stock.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? '#fafaf8' : '#fff' }}>
                    <td className="px-6 py-4 font-medium">{s.name}</td>
                    <td className="px-6 py-4">
                      <span
                        className="mono text-xs px-2 py-1 rounded"
                        style={{ background: s.quantity < 5 ? '#fcecea' : '#e8f5ee', color: s.quantity < 5 ? 'var(--accent)' : 'var(--success)' }}
                      >
                        {s.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 mono text-xs" style={{ color: 'var(--muted)' }}>{new Date(s.last_updated).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Receipts Tab */}
          {!loading && tab === 'receipts' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--paper)' }}>
                  {['Product', 'Qty', 'Price', 'Supplier', 'Date'].map((h) => (
                    <th key={h} className="mono text-xs px-6 py-4 text-left font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-sm" style={{ color: 'var(--muted)' }}>No receipts</td></tr>
                ) : receipts.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? '#fafaf8' : '#fff' }}>
                    <td className="px-6 py-4 font-medium">{r.name}</td>
                    <td className="px-6 py-4 mono text-xs">{r.quantity}</td>
                    <td className="px-6 py-4 mono text-xs">${r.price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-xs" style={{ color: 'var(--muted)' }}>{r.supplier}</td>
                    <td className="px-6 py-4 mono text-xs">{new Date(r.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Commands Tab */}
          {!loading && tab === 'commands' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--paper)' }}>
                  {['Product', 'Qty', 'Price', 'Date', 'Status'].map((h) => (
                    <th key={h} className="mono text-xs px-6 py-4 text-left font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commands.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-sm" style={{ color: 'var(--muted)' }}>No commands</td></tr>
                ) : commands.map((cmd, i) => (
                  <tr key={cmd.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? '#fafaf8' : '#fff' }}>
                    <td className="px-6 py-4 font-medium">{cmd.name}</td>
                    <td className="px-6 py-4 mono text-xs">{cmd.quantity}</td>
                    <td className="px-6 py-4 mono text-xs">${cmd.price.toFixed(2)}</td>
                    <td className="px-6 py-4 mono text-xs">{new Date(cmd.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span
                        className="mono text-xs px-2 py-1 rounded font-medium capitalize"
                        style={{ background: `${STATUS_COLORS[cmd.status]}22`, color: STATUS_COLORS[cmd.status] }}
                      >
                        {cmd.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* AI Recommendation */}
          {tab === 'recommend' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles size={20} style={{ color: '#7C5CFC' }} />
                <div>
                  <h3 className="font-semibold">AI Restocking Recommendations</h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Analyze current stock and suggest optimal orders</p>
                </div>
                <button
                  onClick={handleRecommendation}
                  disabled={aiLoading}
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm"
                  style={{ background: '#7C5CFC', color: '#fff', opacity: aiLoading ? 0.6 : 1 }}
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {recommendation ? 'Regenerate' : 'Generate Recommendations'}
                </button>
              </div>
              {aiLoading && !recommendation && (
                <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={20} className="animate-spin" /> Analyzing inventory data...
                </div>
              )}
              {recommendation && (
                <div className="prose prose-sm max-w-none p-5 rounded-lg" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
                  <ReactMarkdown>{recommendation}</ReactMarkdown>
                </div>
              )}
              {!recommendation && !aiLoading && (
                <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
                  Click "Generate Recommendations" to get AI-powered restocking suggestions
                </div>
              )}
            </div>
          )}

          {/* AI Analysis */}
          {tab === 'analysis' && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <BarChart2 size={20} style={{ color: '#2A9D5C' }} />
                <div>
                  <h3 className="font-semibold">AI Stock Analysis</h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Deep analysis of your inventory health and trends</p>
                </div>
                <button
                  onClick={handleAnalysis}
                  disabled={aiLoading}
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm"
                  style={{ background: '#2A9D5C', color: '#fff', opacity: aiLoading ? 0.6 : 1 }}
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <BarChart2 size={14} />}
                  {analysis ? 'Regenerate' : 'Run Analysis'}
                </button>
              </div>
              {aiLoading && !analysis && (
                <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={20} className="animate-spin" /> Running stock analysis...
                </div>
              )}
              {analysis && (
                <div className="prose prose-sm max-w-none p-5 rounded-lg" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              )}
              {!analysis && !aiLoading && (
                <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
                  Click "Run Analysis" to get a comprehensive stock health report
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Command Modal */}
      {showForm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="rounded-xl p-8 w-full max-w-md fade-up" style={{ background: '#fff' }}>
            <h3 className="text-xl font-semibold mb-6">Create New Command</h3>
            <form onSubmit={handleCreateCommand} className="space-y-4">
              {[
                { label: 'Product Name', key: 'name', type: 'text', placeholder: 'e.g. Steel Bolts M6' },
                { label: 'Quantity', key: 'quantity', type: 'number', placeholder: '0' },
                { label: 'Unit Price ($)', key: 'price', type: 'number', placeholder: '0.00' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="mono text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--muted)' }}>{label}</label>
                  <input
                    type={type}
                    step={type === 'number' ? '0.01' : undefined}
                    value={cmdForm[key as keyof typeof cmdForm]}
                    onChange={(e) => setCmdForm({ ...cmdForm, [key]: e.target.value })}
                    placeholder={placeholder}
                    required
                    className="w-full px-4 py-3 text-sm rounded outline-none"
                    style={{ border: '1px solid var(--border)', background: 'var(--paper)' }}
                    onFocus={(e) => (e.target.style.borderColor = '#7C5CFC')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded text-sm font-medium"
                  style={{ border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded text-sm font-semibold"
                  style={{ background: 'var(--ink)', color: '#fff' }}
                >
                  {submitting ? 'Creating...' : 'Create Command'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
