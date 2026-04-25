"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  getStock,
  getReceipts,
  getCommands,
  createCommand,
  getRecommendation,
  getAnalysis,
  createWebSocket,
} from "@/lib/api";
import toast from "react-hot-toast";
import {
  Plus,
  Loader2,
  RefreshCw,
  Sparkles,
  BarChart2,
  Package,
  ClipboardList,
  Receipt,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

type Tab = "stock" | "receipts" | "commands" | "recommend" | "analysis";

interface Stock {
  id: number;
  name: string;
  quantity: number;
  last_updated: string;
}
interface ReceiptItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  supplier: string;
  date: string;
}
interface Command {
  id: number;
  name: string;
  quantity: number;
  price: number;
  date: string;
  status: string;
}

const NAV = [{ label: "Dashboard", href: "/supervisor", icon: "⚡" }];

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "badge-amber" },
  validated: { label: "Validated", cls: "badge-green" },
  rejected: { label: "Rejected", cls: "badge-red" },
};

export default function SupervisorPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [stock, setStock] = useState<Stock[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [cmdForm, setCmdForm] = useState({ name: "", quantity: "", price: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, c] = await Promise.all([
        getStock(),
        getReceipts(),
        getCommands(),
      ]);
      setStock(s.data || []);
      setReceipts(r.data || []);
      setCommands(c.data || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string; data: unknown };
      if (msg.event === "new_receipt") {
        setReceipts((prev) => [msg.data as ReceiptItem, ...prev]);
        toast("🧾 New receipt scanned!");
      }
      if (msg.event === "command_updated") {
        const updated = msg.data as { id: number; status: string };
        setCommands((prev) =>
          prev.map((c) =>
            c.id === updated.id ? { ...c, status: updated.status } : c,
          ),
        );
      }
    });
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    return () => ws.close();
  }, [loadData]);

  const handleCreateCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createCommand({
        name: cmdForm.name,
        quantity: parseFloat(cmdForm.quantity),
        price: parseFloat(cmdForm.price),
      });
      setCommands((prev) => [res.data, ...prev]);
      setCmdForm({ name: "", quantity: "", price: "" });
      setShowForm(false);
      toast.success("Command created!");
    } catch {
      toast.error("Failed to create command");
    } finally {
      setSubmitting(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "stock", label: "Stock", icon: <Package size={13} /> },
    { id: "receipts", label: "Receipts", icon: <Receipt size={13} /> },
    { id: "commands", label: "Commands", icon: <ClipboardList size={13} /> },
    { id: "recommend", label: "AI Recommend", icon: <Sparkles size={13} /> },
    { id: "analysis", label: "AI Analysis", icon: <BarChart2 size={13} /> },
  ];

  const KPIs = [
    { label: "Stock Items", value: stock.length, color: "#F59E0B" },
    { label: "Receipts", value: receipts.length, color: "#22D3EE" },
    { label: "Commands", value: commands.length, color: "#A78BFA" },
    {
      label: "Pending",
      value: commands.filter((c) => c.status === "pending").length,
      color: "#F43F5E",
    },
  ];

  return (
    <DashboardLayout
      navItems={NAV}
      title="Supervisor"
      roleColor="#A78BFA"
      wsConnected={wsConnected}
    >
      <div className="p-8 max-w-6xl mx-auto stagger">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="mono text-xs uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                ⚡ Full Access Dashboard
              </span>
            </div>
            <h1
              className="font-bold mb-1"
              style={{ fontSize: 28, letterSpacing: "-0.5px" }}
            >
              Supervisor Control
            </h1>
            <p className="text-sm" style={{ color: "var(--muted-hi)" }}>
              Real-time inventory management with AI-powered insights.
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={loadData}
              className="btn btn-ghost text-xs py-2 px-3"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary text-xs py-2 px-4"
            >
              <Plus size={13} /> New Command
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {KPIs.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg p-5 relative overflow-hidden"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="absolute top-0 left-0 w-full h-0.5"
                style={{
                  background: `linear-gradient(90deg, ${kpi.color}, transparent)`,
                }}
              />
              <div
                className="mono text-xs uppercase tracking-wider mb-2"
                style={{ color: "var(--muted)" }}
              >
                {kpi.label}
              </div>
              <div
                className="font-bold"
                style={{
                  fontSize: 32,
                  letterSpacing: "-1.5px",
                  color: kpi.color,
                }}
              >
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-0.5 mb-6 p-1 rounded-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            width: "fit-content",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs transition-all"
              style={{
                background: tab === t.id ? "var(--raised)" : "transparent",
                color: tab === t.id ? "var(--text)" : "var(--muted)",
                fontWeight: tab === t.id ? 600 : 400,
                border:
                  tab === t.id
                    ? "1px solid var(--border-hi)"
                    : "1px solid transparent",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {loading && (
            <div className="p-6 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded shimmer" />
              ))}
            </div>
          )}

          {/* Stock */}
          {!loading && tab === "stock" && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center py-12 text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      No stock items
                    </td>
                  </tr>
                ) : (
                  stock.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.name}</td>
                      <td>
                        <span
                          className={`badge ${s.quantity < 5 ? "badge-red" : "badge-green"}`}
                        >
                          {s.quantity}
                        </span>
                      </td>
                      <td
                        className="mono text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {new Date(s.last_updated).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* Receipts */}
          {!loading && tab === "receipts" && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Supplier</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-12 text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      No receipts
                    </td>
                  </tr>
                ) : (
                  receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}</td>
                      <td className="mono text-xs">{r.quantity}</td>
                      <td
                        className="mono text-xs"
                        style={{ color: "var(--accent)" }}
                      >
                        ${r.price.toFixed(2)}
                      </td>
                      <td
                        className="text-xs"
                        style={{ color: "var(--muted-hi)" }}
                      >
                        {r.supplier}
                      </td>
                      <td
                        className="mono text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* Commands */}
          {!loading && tab === "commands" && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {commands.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-12 text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      No commands
                    </td>
                  </tr>
                ) : (
                  commands.map((cmd) => {
                    const st = STATUS[cmd.status] ?? {
                      label: cmd.status,
                      cls: "badge-cyan",
                    };
                    return (
                      <tr key={cmd.id}>
                        <td className="font-medium">{cmd.name}</td>
                        <td className="mono text-xs">{cmd.quantity}</td>
                        <td
                          className="mono text-xs"
                          style={{ color: "var(--accent)" }}
                        >
                          ${cmd.price.toFixed(2)}
                        </td>
                        <td
                          className="mono text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {new Date(cmd.date).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`badge ${st.cls}`}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* AI Recommendation */}
          {tab === "recommend" && (
            <div className="p-7">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      background: "#A78BFA18",
                      border: "1px solid #A78BFA25",
                    }}
                  >
                    <Sparkles size={17} style={{ color: "#A78BFA" }} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      AI Restocking Recommendations
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      Analyze current stock and suggest optimal orders
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setAiLoading(true);
                    try {
                      const res = await getRecommendation();
                      setRecommendation(res.data.recommendation);
                    } catch {
                      toast.error("AI request failed");
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                  className="btn py-2 px-5 text-xs"
                  style={{
                    background: "#A78BFA",
                    color: "#000",
                    fontWeight: 600,
                  }}
                >
                  {aiLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {recommendation ? "Regenerate" : "Generate"}
                </button>
              </div>

              {aiLoading && !recommendation && (
                <div
                  className="flex items-center justify-center gap-3 py-14"
                  style={{ color: "var(--muted-hi)" }}
                >
                  <Loader2
                    size={18}
                    className="animate-spin"
                    style={{ color: "#A78BFA" }}
                  />
                  Analyzing inventory data...
                </div>
              )}
              {recommendation && (
                <div
                  className="rounded-lg p-5 prose prose-sm prose-invert max-w-none"
                  style={{
                    background: "var(--raised)",
                    border: "1px solid var(--border-hi)",
                    fontSize: 13,
                    lineHeight: 1.8,
                  }}
                >
                  <ReactMarkdown>{recommendation}</ReactMarkdown>
                </div>
              )}
              {!recommendation && !aiLoading && (
                <div
                  className="text-center py-14"
                  style={{ color: "var(--muted)" }}
                >
                  <p className="text-sm">
                    Click "Generate" to get AI-powered restocking suggestions
                  </p>
                </div>
              )}
            </div>
          )}

          {/* AI Analysis */}
          {tab === "analysis" && (
            <div className="p-7">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      background: "#22D3EE12",
                      border: "1px solid #22D3EE25",
                    }}
                  >
                    <BarChart2 size={17} style={{ color: "#22D3EE" }} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      AI Stock Analysis
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      Deep analysis of inventory health and trends
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setAiLoading(true);
                    try {
                      const res = await getAnalysis();
                      setAnalysis(res.data.analysis);
                    } catch {
                      toast.error("AI request failed");
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                  className="btn py-2 px-5 text-xs"
                  style={{
                    background: "#22D3EE",
                    color: "#000",
                    fontWeight: 600,
                  }}
                >
                  {aiLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <BarChart2 size={13} />
                  )}
                  {analysis ? "Regenerate" : "Run Analysis"}
                </button>
              </div>

              {aiLoading && !analysis && (
                <div
                  className="flex items-center justify-center gap-3 py-14"
                  style={{ color: "var(--muted-hi)" }}
                >
                  <Loader2
                    size={18}
                    className="animate-spin"
                    style={{ color: "#22D3EE" }}
                  />
                  Running stock analysis...
                </div>
              )}
              {analysis && (
                <div
                  className="rounded-lg p-5 prose prose-sm prose-invert max-w-none"
                  style={{
                    background: "var(--raised)",
                    border: "1px solid var(--border-hi)",
                    fontSize: 13,
                    lineHeight: 1.8,
                  }}
                >
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              )}
              {!analysis && !aiLoading && (
                <div
                  className="text-center py-14"
                  style={{ color: "var(--muted)" }}
                >
                  <p className="text-sm">
                    Click "Run Analysis" to get a comprehensive stock health
                    report
                  </p>
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
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div
            className="rounded-xl p-7 w-full max-w-md fade-up relative"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-hi)",
            }}
          >
            <div
              className="absolute top-0 left-0 w-full h-0.5 rounded-t-xl"
              style={{
                background: "linear-gradient(90deg, #A78BFA, transparent)",
              }}
            />
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Create Command</h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--raised)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.color = "var(--muted)";
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateCommand} className="space-y-4">
              {[
                {
                  label: "Product Name",
                  key: "name",
                  type: "text",
                  placeholder: "e.g. Steel Bolts M6",
                },
                {
                  label: "Quantity",
                  key: "quantity",
                  type: "number",
                  placeholder: "0",
                },
                {
                  label: "Unit Price ($)",
                  key: "price",
                  type: "number",
                  placeholder: "0.00",
                },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label
                    className="mono text-xs uppercase tracking-wider mb-2 block"
                    style={{ color: "var(--muted)" }}
                  >
                    {label}
                  </label>
                  <input
                    type={type}
                    step={type === "number" ? "0.01" : undefined}
                    value={cmdForm[key as keyof typeof cmdForm]}
                    onChange={(e) =>
                      setCmdForm({ ...cmdForm, [key]: e.target.value })
                    }
                    placeholder={placeholder}
                    required
                    className="input"
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn btn-ghost flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1 justify-center"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Command"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
