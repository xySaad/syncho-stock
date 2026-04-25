"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { login, setAuth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ login: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.login, form.password);
      const { token, user } = res.data;
      setAuth(token, user);
      toast.success(`Welcome back, ${user.login}`);
      const roleMap: Record<string, string> = {
        worker: "/worker",
        inventory_accountant: "/accountant",
        supervisor: "/supervisor",
      };
      router.push(roleMap[user.role] || "/");
    } catch {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* ── Left panel ─────────────────────────────── */}
      <div
        className="hidden lg:flex w-1/2 flex-col relative overflow-hidden"
        style={{ borderRight: "1px solid var(--border)" }}
      >
        {/* Grid background */}
        <div className="absolute inset-0 grid-bg opacity-40" />

        {/* Glow orb */}
        <div
          className="absolute"
          style={{
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, #F59E0B18 0%, transparent 70%)",
            top: -100,
            left: -100,
            pointerEvents: "none",
          }}
        />

        <div className="relative z-10 flex flex-col h-full p-14">
          {/* Logo mark */}
          <div className="flex items-center gap-3 mb-auto">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 2h5v5H2V2zm7 0h5v5H9V2zm0 7h5v5H9V9zm-7 0h5v5H2V9z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span
              className="mono text-xs tracking-widest uppercase"
              style={{ color: "var(--muted)" }}
            >
              Syncho Stock
            </span>
          </div>

          {/* Hero text */}
          <div className="mt-auto mb-12">
            <div
              className="mono text-xs tracking-widest mb-6 inline-flex items-center gap-2 px-3 py-1 rounded"
              style={{
                background: "var(--accent-lo)",
                color: "var(--accent)",
                border: "1px solid #F59E0B25",
              }}
            >
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              System Operational · v2.0
            </div>

            <h1
              className="font-extrabold leading-none mb-6"
              style={{
                fontSize: 72,
                letterSpacing: "-3px",
                color: "var(--text)",
              }}
            >
              Inventory
              <br />
              <span style={{ color: "var(--accent)" }}>Command</span>
              <br />
              Center
            </h1>

            <p
              style={{
                color: "var(--muted-hi)",
                maxWidth: 360,
                lineHeight: 1.7,
              }}
            >
              AI-powered receipt scanning, real-time stock commands, and
              intelligent inventory analysis — all in one secure platform.
            </p>
          </div>

          {/* Role cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                role: "Worker",
                desc: "Scan receipts · Validate commands",
                color: "var(--danger)",
                abbr: "WK",
              },
              {
                role: "Accountant",
                desc: "Reports · AI analysis",
                color: "var(--cyan)",
                abbr: "AC",
              },
              {
                role: "Supervisor",
                desc: "Full access · AI insights",
                color: "var(--accent)",
                abbr: "SV",
              },
            ].map((item) => (
              <div
                key={item.role}
                className="p-4 rounded-lg"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center mono text-xs font-bold mb-3"
                  style={{ background: item.color + "20", color: item.color }}
                >
                  {item.abbr}
                </div>
                <div
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--text)" }}
                >
                  {item.role}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)", lineHeight: 1.5 }}
                >
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ──────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div
          className="absolute inset-0 grid-bg opacity-20"
          style={{ pointerEvents: "none" }}
        />

        <div className="w-full max-w-sm relative z-10 fade-up">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 2h5v5H2V2zm7 0h5v5H9V2zm0 7h5v5H9V9zm-7 0h5v5H2V9z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span
              className="mono text-xs tracking-widest uppercase"
              style={{ color: "var(--muted)" }}
            >
              Syncho Stock
            </span>
          </div>

          <h2
            className="font-bold mb-1"
            style={{ fontSize: 28, letterSpacing: "-0.5px" }}
          >
            Sign in
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
            Default password:{" "}
            <code
              className="mono px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "var(--raised)",
                color: "var(--accent)",
                border: "1px solid var(--border-hi)",
              }}
            >
              admin123
            </code>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="mono text-xs uppercase tracking-wider mb-2 block"
                style={{ color: "var(--muted)" }}
              >
                Username
              </label>
              <input
                type="text"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                placeholder="admin · worker1 · accountant1"
                required
                className="input"
              />
            </div>

            <div>
              <label
                className="mono text-xs uppercase tracking-wider mb-2 block"
                style={{ color: "var(--muted)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-3 text-sm"
              style={{ marginTop: 8 }}
            >
              {loading ? (
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
                  Authenticating...
                </>
              ) : (
                <>Access Dashboard →</>
              )}
            </button>
          </form>

          <div
            className="mt-10 pt-8 flex items-start gap-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div
              className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{
                background: "var(--cyan-lo)",
                color: "var(--cyan)",
                border: "1px solid #22D3EE25",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <p
              className="text-xs"
              style={{ color: "var(--muted)", lineHeight: 1.6 }}
            >
              Demo accounts are available for all three roles. Contact your
              supervisor to provision new users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
