"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getUser, logout } from "@/lib/api";
import { LogOut, WifiOff } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  navItems: NavItem[];
  title: string;
  roleColor: string;
  wsConnected?: boolean;
}

export default function DashboardLayout({
  children,
  navItems,
  title,
  roleColor,
  wsConnected,
}: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ login: string; role: string } | null>(
    null,
  );

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.push("/");
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return null;

  const roleLabel = user.role.replace(/_/g, " ");

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Brand */}
        <div
          className="px-5 py-6"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className="w-7 h-7 rounded flex-shrink-0 flex items-center justify-center"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
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
              Syncho
            </span>
          </div>
          <div
            className="mono text-xs mt-2 px-2 py-0.5 rounded inline-block"
            style={{
              background: roleColor + "18",
              color: roleColor,
              border: `1px solid ${roleColor}25`,
            }}
          >
            {title}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left transition-all"
                style={{
                  background: active ? roleColor + "15" : "transparent",
                  color: active ? roleColor : "var(--muted-hi)",
                  fontWeight: active ? 600 : 400,
                  borderLeft: active
                    ? `2px solid ${roleColor}`
                    : "2px solid transparent",
                  paddingLeft: active ? 10 : 12,
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
          {/* User info */}
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mono text-xs font-bold"
              style={{
                background: roleColor + "20",
                color: roleColor,
                border: `1px solid ${roleColor}30`,
              }}
            >
              {user.login[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{user.login}</div>
              <div
                className="mono text-xs truncate capitalize"
                style={{ color: "var(--muted)", fontSize: 10 }}
              >
                {roleLabel}
              </div>
            </div>
          </div>

          {/* WS status + logout */}
          <div className="flex items-center justify-between">
            {wsConnected !== undefined && (
              <div className="flex items-center gap-1.5">
                {wsConnected ? (
                  <>
                    <span
                      className="live-dot"
                      style={{ width: 6, height: 6 }}
                    />
                    <span
                      className="mono text-xs"
                      style={{ color: "var(--muted)", fontSize: 10 }}
                    >
                      Live
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff size={10} color="var(--muted)" />
                    <span
                      className="mono text-xs"
                      style={{ color: "var(--muted)", fontSize: 10 }}
                    >
                      Offline
                    </span>
                  </>
                )}
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: "var(--muted)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--danger)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--muted)")
              }
            >
              <LogOut size={12} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto" style={{ minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
