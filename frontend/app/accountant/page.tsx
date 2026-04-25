'use client'

import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { getReceipts, getReport, createWebSocket } from '@/lib/api'
import toast from 'react-hot-toast'
import { FileText, TrendingUp, RefreshCw, Loader2, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Receipt {
  id: number
  name: string
  quantity: number
  price: number
  supplier: string
  date: string
}

const NAV = [{ label: 'Reports & Analysis', href: '/accountant', icon: '📊' }]

export default function AccountantPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [report, setReport] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadReceipts = useCallback(async () => {
    try {
      const res = await getReceipts()
      setReceipts(res.data || [])
    } catch {
      toast.error('Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReceipts()
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string }
      if (msg.event === 'new_receipt') loadReceipts()
    })
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    return () => ws.close()
  }, [loadReceipts])

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      const res = await getReport()
      setReport(res.data.report)
      toast.success('Report generated!')
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const totalValue = receipts.reduce((s, r) => s + r.price * r.quantity, 0)
  const uniqueSuppliers = new Set(receipts.map((r) => r.supplier)).size
  const avgPrice = receipts.length ? receipts.reduce((s, r) => s + r.price, 0) / receipts.length : 0

  return (
    <DashboardLayout navItems={NAV} title="Accountant" roleColor="#2A9D5C" wsConnected={wsConnected}>
      <div className="p-8 max-w-6xl mx-auto stagger">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Inventory Reports</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            AI-generated analysis of purchases and inventory movements.
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Purchase Value', value: `$${totalValue.toLocaleString('en', { minimumFractionDigits: 2 })}`, icon: '💰' },
            { label: 'Total Receipts', value: String(receipts.length), icon: '🧾' },
            { label: 'Suppliers', value: String(uniqueSuppliers), icon: '🏭' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg p-6"
              style={{ background: '#fff', border: '1px solid var(--border)' }}
            >
              <div className="text-2xl mb-2">{kpi.icon}</div>
              <div className="mono text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                {kpi.label}
              </div>
              <div className="text-2xl font-semibold">{kpi.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receipts table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Receipts</h2>
              <button
                onClick={loadReceipts}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: '#fff' }}>
              {loading ? (
                <div className="p-8 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 rounded shimmer" />
                  ))}
                </div>
              ) : receipts.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>No receipts yet</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--border)' }}>
                        {['Product', 'Qty', 'Price', 'Supplier', 'Date'].map((h) => (
                          <th key={h} className="mono text-xs px-4 py-3 text-left font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r, i) => (
                        <tr
                          key={r.id}
                          style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? '#fafaf8' : '#fff' }}
                        >
                          <td className="px-4 py-3 font-medium">{r.name}</td>
                          <td className="px-4 py-3 mono text-xs">{r.quantity}</td>
                          <td className="px-4 py-3 mono text-xs">${r.price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{r.supplier}</td>
                          <td className="px-4 py-3 mono text-xs">{new Date(r.date).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* AI Report */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp size={16} style={{ color: '#2A9D5C' }} /> AI Report
              </h2>
              {report && (
                <button
                  onClick={() => {
                    const blob = new Blob([report], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.md`
                    a.click()
                  }}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  <Download size={12} /> Export
                </button>
              )}
            </div>

            <div
              className="rounded-lg p-6"
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                minHeight: 380,
                position: 'relative',
              }}
            >
              {!report && !generating && (
                <div className="flex flex-col items-center justify-center h-full gap-4" style={{ minHeight: 300 }}>
                  <FileText size={40} strokeWidth={1} style={{ color: 'var(--muted)' }} />
                  <p className="text-sm text-center" style={{ color: 'var(--muted)', maxWidth: 220 }}>
                    Generate an AI analysis of your purchase and order history
                  </p>
                  <button
                    onClick={handleGenerateReport}
                    className="px-6 py-2.5 rounded font-semibold text-sm"
                    style={{ background: 'var(--ink)', color: '#fff' }}
                  >
                    Generate Report
                  </button>
                </div>
              )}

              {generating && (
                <div className="flex items-center justify-center h-full gap-3" style={{ minHeight: 300 }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>AI is analyzing your data...</span>
                </div>
              )}

              {report && !generating && (
                <div>
                  <div
                    className="prose prose-sm max-w-none overflow-auto"
                    style={{ maxHeight: 320, color: 'var(--ink)' }}
                  >
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                  <button
                    onClick={handleGenerateReport}
                    className="mt-4 flex items-center gap-1.5 text-xs px-4 py-2 rounded"
                    style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  >
                    <RefreshCw size={11} /> Regenerate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
