'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { uploadReceipt, getCommands, validateCommand, createWebSocket } from '@/lib/api'
import toast from 'react-hot-toast'
import { Upload, Camera, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

interface Command {
  id: number
  name: string
  quantity: number
  price: number
  date: string
  status: string
}

interface Receipt {
  id: number
  name: string
  quantity: number
  price: number
  supplier: string
  date: string
}

const NAV = [
  { label: 'Scan Receipt', href: '/worker', icon: '📷' },
]

export default function WorkerPage() {
  const [commands, setCommands] = useState<Command[]>([])
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [validating, setValidating] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const loadCommands = useCallback(async () => {
    try {
      const res = await getCommands()
      setCommands(res.data.filter((c: Command) => c.status === 'pending'))
    } catch {}
  }, [])

  useEffect(() => {
    loadCommands()
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string; data: unknown }
      if (msg.event === 'new_command') {
        setCommands((prev) => [msg.data as Command, ...prev])
        toast('📦 New command received!')
      }
    })
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    wsRef.current = ws
    return () => ws.close()
  }, [loadCommands])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await uploadReceipt(fd)
      setLastReceipt(res.data)
      toast.success('Receipt scanned & stored!')
      setFile(null)
      setPreview(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e?.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleValidate = async (id: number, status: 'validated' | 'rejected') => {
    setValidating(id)
    try {
      await validateCommand(id, status)
      setCommands((prev) => prev.filter((c) => c.id !== id))
      toast.success(`Command ${status}`)
    } catch {
      toast.error('Action failed')
    } finally {
      setValidating(null)
    }
  }

  return (
    <DashboardLayout navItems={NAV} title="Worker" roleColor="#E84C2E" wsConnected={wsConnected}>
      <div className="p-8 max-w-5xl mx-auto stagger">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Receipt Scanner</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Upload a receipt photo — AI will extract the data automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload zone */}
          <div>
            <div
              className="rounded-lg p-8 text-center cursor-pointer transition-all"
              style={{
                border: `2px dashed ${preview ? 'var(--accent)' : 'var(--border)'}`,
                background: '#fff',
                minHeight: 280,
                position: 'relative',
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !preview && fileRef.current?.click()}
            >
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="preview" className="max-h-52 mx-auto rounded object-contain" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null) }}
                    className="absolute top-0 right-0 text-xs px-2 py-1 rounded"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3" style={{ minHeight: 200 }}>
                  <Camera size={40} strokeWidth={1} style={{ color: 'var(--muted)' }} />
                  <p className="text-sm font-medium">Drop receipt image here</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>or click to browse</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full mt-3 py-3 rounded font-semibold text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: !file || uploading ? 'var(--muted)' : 'var(--ink)',
                color: '#fff',
                cursor: !file || uploading ? 'not-allowed' : 'pointer',
              }}
            >
              <Upload size={15} />
              {uploading ? 'AI Processing...' : 'Scan Receipt'}
            </button>
          </div>

          {/* Last extracted receipt */}
          <div>
            <div
              className="rounded-lg p-6"
              style={{ background: '#fff', border: '1px solid var(--border)', minHeight: 320 }}
            >
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: lastReceipt ? 'var(--success)' : 'var(--muted)' }} />
                Last Extracted Data
              </h3>
              {lastReceipt ? (
                <div className="space-y-3">
                  {[
                    { label: 'Product', value: lastReceipt.name },
                    { label: 'Quantity', value: String(lastReceipt.quantity) },
                    { label: 'Price', value: `$${lastReceipt.price.toFixed(2)}` },
                    { label: 'Supplier', value: lastReceipt.supplier },
                    { label: 'Date', value: new Date(lastReceipt.date).toLocaleDateString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                      <span className="mono text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</span>
                      <span className="font-medium text-sm">{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-48" style={{ color: 'var(--muted)' }}>
                  <p className="text-sm">No receipt scanned yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pending Commands */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              Pending Commands
              {commands.length > 0 && (
                <span className="ml-2 mono text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {commands.length}
                </span>
              )}
            </h2>
            <button onClick={loadCommands} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {commands.length === 0 ? (
            <div className="rounded-lg py-12 text-center" style={{ background: '#fff', border: '1px solid var(--border)' }}>
              <Clock size={32} className="mx-auto mb-3" style={{ color: 'var(--muted)' }} strokeWidth={1} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No pending commands</p>
            </div>
          ) : (
            <div className="space-y-3">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="rounded-lg p-5 flex items-center justify-between"
                  style={{ background: '#fff', border: '1px solid var(--border)' }}
                >
                  <div>
                    <div className="font-semibold text-sm mb-1">{cmd.name}</div>
                    <div className="flex gap-4">
                      <span className="mono text-xs" style={{ color: 'var(--muted)' }}>Qty: {cmd.quantity}</span>
                      <span className="mono text-xs" style={{ color: 'var(--muted)' }}>${cmd.price.toFixed(2)}</span>
                      <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{new Date(cmd.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={validating === cmd.id}
                      onClick={() => handleValidate(cmd.id, 'validated')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-opacity"
                      style={{ background: '#e8f5ee', color: 'var(--success)' }}
                    >
                      <CheckCircle size={13} /> Validate
                    </button>
                    <button
                      disabled={validating === cmd.id}
                      onClick={() => handleValidate(cmd.id, 'rejected')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-opacity"
                      style={{ background: '#fcecea', color: 'var(--accent)' }}
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
