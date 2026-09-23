"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NavItem {
  label: string;
  href: string;
  badge?: string;
  icon: React.ReactNode;
}

const operations: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: "Today's Orders",
    href: "/today",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <circle cx="12" cy="15" r="2" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Tomorrow's Orders",
    href: "/tomorrow",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <polyline points="10 14 12 16 15 13"/>
      </svg>
    ),
  },
  {
    label: "In-Transit",
    href: "/in-transit",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    label: "Delivered",
    href: "/delivered",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
  {
    label: "RTO & Issues",
    href: "/rtd",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
];

const THEMES = [
  { id: "light", label: "Clean Slate (Light)" },
  { id: "dark", label: "Logistics Dark (Night)" },
  { id: "amber", label: "Amber Dispatch" },
  { id: "emerald", label: "Emerald Cargo" },
];

export function AppShell({ children, currentPath }: { children: React.ReactNode; currentPath: string }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("dispatch_desk_theme") || "light";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    localStorage.setItem("dispatch_desk_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="brand-mark">DD</span>
            <span style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.02em" }}>Dispatch Desk</span>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#34d399",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
            title="Real-Time Google Sheets Sync Engine Active"
          >
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            LIVE
          </span>
        </div>

        <nav className="nav-group" aria-label="Operations">
          <span className="nav-label">Operations</span>
          {operations.map((item) => (
            <Link
              key={item.href}
              className={`nav-link ${item.href === currentPath ? "active" : ""}`}
              href={item.href}
            >
              <span style={{ display: "inline-flex", opacity: item.href === currentPath ? 1 : 0.8 }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <nav className="nav-group" aria-label="Administration">
          <span className="nav-label">Administration</span>
          <Link
            className={`nav-link ${currentPath === "/settings" ? "active" : ""}`}
            href="/settings"
          >
            <span style={{ display: "inline-flex", opacity: currentPath === "/settings" ? 1 : 0.8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </span>
            <span>Sheet Sources &amp; Webhooks</span>
          </Link>
        </nav>

        {/* Theme Selector */}
        <div className="theme-selector">
          <label htmlFor="theme-select">🎨 Workspace Theme</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sidebar-note">
          <strong>Enterprise Desk</strong>
          <br />
          Viewer-only operations synchronized with live Google Sheets.
        </div>
      </aside>

      <main className="page">{children}</main>
    </div>
  );
}
