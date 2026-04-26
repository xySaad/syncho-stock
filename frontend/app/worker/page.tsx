"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  uploadReceipt,
  getCommands,
  validateCommand,
  createWebSocket,
} from "@/lib/api";
import toast from "react-hot-toast";
import {
  Upload,
  Camera,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
} from "lucide-react";

interface Command {
  id: number;
  name: string;
  quantity: number;
  price: number;
  date: string;
  status: string;
}

interface Receipt {
  id: number;
  name: string;
  quantity: number;
  price: number;
  supplier: string;
  date: string;
}

interface UploadReceiptResponse {
  count?: number;
  items?: Receipt[];
  id?: number;
  name?: string;
  quantity?: number;
  price?: number;
  supplier?: string;
  date?: string;
}

const NAV = [{ label: "Receipt Scanner", href: "/worker", icon: "📡" }];

export default function WorkerPage() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [lastReceipts, setLastReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [validating, setValidating] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCommands = useCallback(async () => {
    try {
      const res = await getCommands();
      setCommands(res.data.filter((c: Command) => c.status === "pending"));
    } catch {}
  }, []);

  useEffect(() => {
    loadCommands();
    const ws = createWebSocket((data: unknown) => {
      const msg = data as { event: string; data: unknown };
      if (msg.event === "new_command") {
        setCommands((prev) => [msg.data as Command, ...prev]);
        toast("📦 New command received!");
      }
    });
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    return () => ws.close();
  }, [loadCommands]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await uploadReceipt(fd);
      const data = res.data as UploadReceiptResponse;

      if (Array.isArray(data.items) && data.items.length > 0) {
        setLastReceipts(data.items);
        toast.success(`${data.items.length} receipt items scanned & stored!`);
      } else if (typeof data.id === "number") {
        setLastReceipts([data as Receipt]);
        toast.success("Receipt scanned & stored!");
      } else {
        toast.error("Upload succeeded but no items were returned");
      }

      setFile(null);
      setPreview(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleValidate = async (
    id: number,
    status: "validated" | "rejected",
  ) => {
    setValidating(id);
    try {
      await validateCommand(id, status);
      setCommands((prev) => prev.filter((c) => c.id !== id));
      toast.success(`Command ${status}`);
    } catch {
      toast.error("Action failed");
    } finally {
      setValidating(null);
    }
  };

  return (
    <DashboardLayout
      navItems={NAV}
      title="Worker"
      roleColor="#F43F5E"
      wsConnected={wsConnected}
    >
      <div className="p-8 max-w-5xl mx-auto stagger">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} style={{ color: "#F43F5E" }} />
            <span
              className="mono text-xs uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              AI Receipt Scanner
            </span>
          </div>
          <h1
            className="font-bold mb-1"
            style={{ fontSize: 28, letterSpacing: "-0.5px" }}
          >
            Scan & Process
          </h1>
          <p className="text-sm" style={{ color: "var(--muted-hi)" }}>
            Upload a receipt photo — AI extracts all data automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upload zone */}
          <div>
            <div
              className="rounded-lg p-6 text-center cursor-pointer transition-all"
              style={{
                border: `2px dashed ${preview ? "#F43F5E" : "var(--border-hi)"}`,
                background: preview ? "#F43F5E08" : "var(--surface)",
                minHeight: 260,
                position: "relative",
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !preview && fileRef.current?.click()}
            >
              {preview ? (
                <div className="relative">
                  <img
                    src={preview}
                    alt="preview"
                    className="max-h-48 mx-auto rounded object-contain"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                    }}
                    className="absolute top-0 right-0 w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3"
                  style={{ minHeight: 200 }}
                >
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      background: "var(--raised)",
                      border: "1px solid var(--border-hi)",
                    }}
                  >
                    <Camera
                      size={28}
                      style={{ color: "var(--muted)" }}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm mb-1">
                      Drop receipt image here
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      or click to browse files
                    </p>
                  </div>
                  <div
                    className="mono text-xs px-3 py-1 rounded"
                    style={{
                      background: "var(--raised)",
                      color: "var(--muted)",
                      border: "1px solid var(--border-hi)",
                    }}
                  >
                    PNG · JPG · WEBP
                  </div>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn btn-primary w-full justify-center mt-3 py-3"
            >
              {uploading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeOpacity=".3"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  AI Processing...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Scan with AI
                </>
              )}
            </button>
          </div>

          {/* Extracted result */}
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--raised)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background:
                      lastReceipts.length > 0
                        ? "var(--success)"
                        : "var(--muted)",
                    display: "inline-block",
                  }}
                />
                <span
                  className="mono text-xs uppercase tracking-wider"
                  style={{ color: "var(--muted)" }}
                >
                  Extracted Data
                </span>
              </div>
              {lastReceipts.length > 0 && (
                <span className="badge badge-green">
                  {lastReceipts.length} items
                </span>
              )}
            </div>

            <div className="p-5">
              {lastReceipts.length > 0 ? (
                <div className="space-y-6">
                  {lastReceipts.map((receipt, idx) => (
                    <div key={idx}>
                      {idx > 0 && (
                        <div
                          className="border-t my-4"
                          style={{ borderColor: "var(--border)" }}
                        />
                      )}
                      <div className="space-y-0">
                        {[
                          {
                            label: "Product",
                            value: receipt.name || "Unknown",
                          },
                          {
                            label: "Quantity",
                            value: String(receipt.quantity || 0),
                          },
                          {
                            label: "Unit Price",
                            value: `$${(receipt.price ?? 0).toFixed(2)}`,
                          },
                          {
                            label: "Supplier",
                            value: receipt.supplier || "Unknown",
                          },
                          {
                            label: "Date",
                            value: receipt.date
                              ? new Date(receipt.date).toLocaleDateString()
                              : "Unknown",
                          },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between py-3"
                            style={{ borderBottom: "1px solid var(--border)" }}
                          >
                            <span
                              className="mono text-xs uppercase tracking-wider"
                              style={{ color: "var(--muted)" }}
                            >
                              {label}
                            </span>
                            <span className="font-medium text-sm">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 py-10"
                  style={{ color: "var(--muted)" }}
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{
                      background: "var(--raised)",
                      border: "1px solid var(--border-hi)",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm">No receipt processed yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pending Commands */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="font-bold" style={{ fontSize: 18 }}>
                Pending Commands
              </h2>
              {commands.length > 0 && (
                <span
                  className="mono text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{
                    background: "#F43F5E20",
                    color: "var(--danger)",
                    border: "1px solid #F43F5E30",
                  }}
                >
                  {commands.length}
                </span>
              )}
            </div>
            <button
              onClick={loadCommands}
              className="btn btn-ghost text-xs py-1.5 px-3"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {commands.length === 0 ? (
            <div
              className="rounded-lg py-14 text-center"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <Clock
                size={28}
                className="mx-auto mb-3"
                style={{ color: "var(--muted)" }}
                strokeWidth={1.5}
              />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No pending commands
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="rounded-lg px-5 py-4 flex items-center justify-between"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div className="font-semibold text-sm mb-1.5">
                      {cmd.name}
                    </div>
                    <div className="flex gap-4">
                      <span
                        className="mono text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        Qty{" "}
                        <span style={{ color: "var(--text)" }}>
                          {cmd.quantity}
                        </span>
                      </span>
                      <span
                        className="mono text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        Price{" "}
                        <span style={{ color: "var(--accent)" }}>
                          ${cmd.price.toFixed(2)}
                        </span>
                      </span>
                      <span
                        className="mono text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {new Date(cmd.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={validating === cmd.id}
                      onClick={() => handleValidate(cmd.id, "validated")}
                      className="btn btn-success py-2 px-3 text-xs"
                    >
                      <CheckCircle size={12} /> Validate
                    </button>
                    <button
                      disabled={validating === cmd.id}
                      onClick={() => handleValidate(cmd.id, "rejected")}
                      className="btn btn-danger py-2 px-3 text-xs"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
