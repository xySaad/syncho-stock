"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { getReceipts, getReport, createWebSocket } from "@/lib/api";
import toast from "react-hot-toast";
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Download,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Receipt {
  id: number;
  name: string;
  quantity: number;
  price: number;
  supplier: string;
  date: string;
}

const NAV = [{ label: "Reports & Analysis", href: "/accountant", icon: "📊" }];

export default function AccountantPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReceipts = useCallback(async () => {
    try {
      const res = await getReceipts();
      setReceipts(res.data || []);
    } catch {
      toast.error("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReceipts();
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string };
      if (msg.event === "new_receipt") loadReceipts();
    });
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    return () => ws.close();
  }, [loadReceipts]);

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const res = await getReport();
      setReport(res.data.report);
      toast.success("Report generated!");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const totalValue = receipts.reduce((s, r) => s + r.price * r.quantity, 0);
  const uniqueSuppliers = new Set(receipts.map((r) => r.supplier)).size;
  const avgPrice = receipts.length
    ? receipts.reduce((s, r) => s + r.price, 0) / receipts.length
    : 0;

  return (
    <DashboardLayout
      navItems={NAV}
      title="Accountant"
      roleColor="#22D3EE"
      wsConnected={wsConnected}
    >
      <div className="p-8 max-w-6xl mx-auto stagger">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} style={{ color: "#22D3EE" }} />
            <span
              className="mono text-xs uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Inventory Intelligence
            </span>
          </div>
          <h1
            className="font-bold mb-1"
            style={{ fontSize: 28, letterSpacing: "-0.5px" }}
          >
            Reports & Analysis
          </h1>
          <p className="text-sm" style={{ color: "var(--muted-hi)" }}>
            AI-generated analysis of purchases and inventory movements.
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Total Purchase Value",
              value: `$${totalValue.toLocaleString("en", { minimumFractionDigits: 2 })}`,
              sub: "All receipts combined",
              color: "#22D3EE",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.86 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
                </svg>
              ),
            },
            {
              label: "Total Receipts",
              value: receipts.length,
              sub: "Scanned & processed",
              color: "#F59E0B",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
            },
            {
              label: "Suppliers",
              value: uniqueSuppliers,
              sub: `Avg price $${avgPrice.toFixed(2)}`,
              color: "#10B981",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              ),
            },
          ].map((kpi) => (
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
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{
                  background: kpi.color + "18",
                  color: kpi.color,
                  border: `1px solid ${kpi.color}25`,
                }}
              >
                {kpi.icon}
              </div>
              <div
                className="mono text-xs uppercase tracking-wider mb-1"
                style={{ color: "var(--muted)" }}
              >
                {kpi.label}
              </div>
              <div
                className="font-bold mb-1"
                style={{
                  fontSize: 26,
                  letterSpacing: "-1px",
                  color: kpi.color,
                }}
              >
                {kpi.value}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {kpi.sub}
              </div>
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
                className="btn btn-ghost text-xs py-1.5 px-3"
              >
                <RefreshCw size={11} /> Refresh
              </button>
            </div>

            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              {loading ? (
                <div className="p-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-9 rounded shimmer" />
                  ))}
                </div>
              ) : receipts.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    No receipts yet
                  </p>
                </div>
              ) : (
                <div className="overflow-auto max-h-96">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {["Product", "Qty", "Price", "Supplier", "Date"].map(
                          (h) => (
                            <th key={h}>{h}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => (
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
                <Sparkles size={15} style={{ color: "#22D3EE" }} />
                AI Report
              </h2>
              {report && (
                <button
                  onClick={() => {
                    const blob = new Blob([report], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `report-${new Date().toISOString().slice(0, 10)}.md`;
                    a.click();
                  }}
                  className="btn btn-ghost text-xs py-1.5 px-3"
                >
                  <Download size={11} /> Export
                </button>
              )}
            </div>

            <div
              className="rounded-lg"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                minHeight: 380,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {!report && !generating && (
                <div
                  className="flex flex-col items-center justify-center h-full gap-5 p-8"
                  style={{ minHeight: 340 }}
                >
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      background: "#22D3EE12",
                      border: "1px solid #22D3EE25",
                    }}
                  >
                    <Sparkles
                      size={28}
                      style={{ color: "#22D3EE" }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold mb-1">Generate AI Report</p>
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted)", maxWidth: 220 }}
                    >
                      Deep analysis of your purchase and order history
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateReport}
                    className="btn btn-primary px-6 py-2.5 text-sm"
                  >
                    Generate Report
                  </button>
                </div>
              )}

              {generating && (
                <div
                  className="flex items-center justify-center h-full gap-3 p-8"
                  style={{ minHeight: 340, color: "var(--muted-hi)" }}
                >
                  <Loader2
                    size={18}
                    className="animate-spin"
                    style={{ color: "#22D3EE" }}
                  />
                  <span className="text-sm">AI is analyzing your data...</span>
                </div>
              )}

              {report && !generating && (
                <div className="p-5">
                  <div
                    className="prose prose-sm prose-invert max-w-none overflow-auto"
                    style={{
                      maxHeight: 300,
                      color: "var(--text)",
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <button
                      onClick={handleGenerateReport}
                      className="btn btn-ghost text-xs py-1.5 px-3"
                    >
                      <RefreshCw size={11} /> Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
