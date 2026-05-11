"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { useLedgerSession } from "@/context/LedgerSessionContext";
import { useThemePreference, type ThemePreference } from "@/context/ThemeContext";
import { useClientMounted } from "@/hooks/useClientMounted";

const SIDEBAR_COLLAPSED_KEY = "ql-sidebar-collapsed";

/** Sidebar order: executive mockup core (Strategy → Quantum → Simulations) + product routes + Settings stub */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Executive Dashboard", icon: "dashboard" },
  { href: "/portfolio", label: "Portfolio Lab", icon: "science" },
  { href: "/strategy", label: "Strategy Builder", icon: "architecture" },
  { href: "/quantum", label: "Quantum Engine", icon: "memory" },
  { href: "/simulations", label: "Simulations", icon: "query_stats" },
  { href: "/reports", label: "Reports", icon: "description" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  collapsed: boolean;
}) {
  const base =
    "flex items-center rounded-lg text-sm font-medium transition-all no-underline shrink-0";
  const expandedPad = "gap-3 px-4 py-3 border-l-4";
  const iconOnlyPad = "justify-center px-2 py-3 min-w-0";
  const activeExpanded =
    "bg-ql-surface-container text-ql-primary border-ql-primary-container";
  const activeCollapsed =
    "bg-ql-surface-container text-ql-primary ring-2 ring-inset ring-ql-primary-container/80 border-transparent";
  const idleExpanded =
    "text-ql-on-surface-variant hover:bg-ql-surface-container hover:text-ql-on-surface border-transparent";
  const idleCollapsed =
    "text-ql-on-surface-variant hover:bg-ql-surface-container hover:text-ql-on-surface border-transparent";

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`${base} ${collapsed ? iconOnlyPad : expandedPad} ${
        active
          ? collapsed
            ? activeCollapsed
            : `${activeExpanded} border-l-4`
          : collapsed
            ? idleCollapsed
            : `${idleExpanded} border-l-4`
      }`}
    >
      <span className="material-symbols-outlined text-xl shrink-0">{icon}</span>
      {!collapsed ? <span className="font-body truncate">{label}</span> : null}
    </Link>
  );
}

const THEME_META: Record<ThemePreference, { icon: string; label: string }> = {
  dark: { icon: "dark_mode", label: "Dark" },
  light: { icon: "light_mode", label: "Light" },
  system: { icon: "contrast", label: "System" },
};

function objectiveLabel(obj: string): string {
  return obj.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Same output on server and client — avoids hydration mismatch vs `toLocaleString`. */
function formatLastRunStable(iso: string): string {
  if (iso.length >= 16) return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  return iso;
}

function sessionsDiffer(
  last: { objective: string; tickers: string[] },
  current: { objective: string; tickers: string[] }
): boolean {
  if (last.objective !== current.objective) return true;
  if (last.tickers.length !== current.tickers.length) return true;
  const a = [...last.tickers].sort().join("\0");
  const b = [...current.tickers].sort().join("\0");
  return a !== b;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session } = useLedgerSession();
  const { preference, cycle } = useThemePreference();
  const themeMeta = THEME_META[preference];
  const mounted = useClientMounted();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        queueMicrotask(() => setSidebarCollapsed(true));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const lo = session.lastOptimize;
  const displayObjective = lo ? lo.objective : session.objective;
  const displayTickerCount = lo ? lo.tickers.length : session.tickers.length;
  const currentDiffersFromLast =
    lo != null && sessionsDiffer(lo, session);

  const lastRunLabel = lo
    ? mounted
      ? new Date(lo.at).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : formatLastRunStable(lo.at)
    : null;

  const sessionTooltip = [
    `Session · ${objectiveLabel(displayObjective)}`,
    `${displayTickerCount} ticker${displayTickerCount === 1 ? "" : "s"}`,
    lo ? `Last run ${lastRunLabel}` : null,
    currentDiffersFromLast
      ? `Current: ${objectiveLabel(session.objective)} · ${session.tickers.length} tickers`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Material Symbols: loaded in root layout <head> (not here — body <link> breaks layout/CSS ordering in some browsers). */}
      {/* Sidebar */}
      <aside
        className={`hidden md:flex flex-col h-screen fixed left-0 top-0 bg-ql-surface-low border-r border-ql-outline-variant z-50 overflow-hidden transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Inner column: header + scrollable nav + fixed footer — avoids whole-aside scroll collapsing flex layout */}
        <div className="flex flex-col flex-1 min-h-0 py-6">
          <div
            className={`mb-6 shrink-0 flex gap-2 ${
              sidebarCollapsed ? "flex-col items-center px-2" : "items-start justify-between px-6"
            }`}
          >
            <Link
              href="/dashboard"
              className={`block no-underline text-inherit hover:opacity-95 transition-opacity min-w-0 ${
                sidebarCollapsed ? "text-center" : ""
              }`}
              title={sidebarCollapsed ? "Quantum Ledger · Dashboard" : undefined}
            >
              {sidebarCollapsed ? (
                <span className="font-headline text-ql-primary text-lg font-bold tracking-tighter block">
                  QL
                </span>
              ) : (
                <>
                  <h1 className="font-headline text-ql-primary text-lg font-bold tracking-tighter">
                    Quantum Ledger
                  </h1>
                  <p className="text-ql-on-surface-variant text-[10px] uppercase tracking-widest mt-1">
                    v1.0 Active
                  </p>
                </>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`shrink-0 flex items-center justify-center rounded-lg p-1.5 text-ql-on-surface-variant hover:bg-ql-surface-container hover:text-ql-on-surface transition-colors ${
                sidebarCollapsed ? "w-full" : ""
              }`}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse to icons"}
            >
              <span className="material-symbols-outlined text-xl">
                {sidebarCollapsed ? "chevron_right" : "chevron_left"}
              </span>
            </button>
          </div>

          <nav
            className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain space-y-1 ${
              sidebarCollapsed ? "px-1.5" : "px-3"
            }`}
          >
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
                collapsed={sidebarCollapsed}
              />
            ))}
          </nav>

          <div
            className={`flex flex-col gap-4 shrink-0 border-t border-ql-outline-variant pt-4 w-full min-w-0 ${
              sidebarCollapsed ? "px-1.5" : "px-6"
            }`}
          >
            {sidebarCollapsed ? (
              <div
                className="flex justify-center rounded-lg bg-ql-surface-container/60 border border-ql-outline-variant p-2.5 shrink-0"
                title={sessionTooltip}
              >
                <span className="material-symbols-outlined text-ql-on-surface-variant text-xl">
                  insights
                </span>
              </div>
            ) : (
              <div
                role="region"
                aria-label="Session summary"
                className="flex flex-col gap-1.5 w-full min-w-0 shrink-0 rounded-lg bg-ql-surface-container/60 border border-ql-outline-variant px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2 min-h-[14px]">
                  <span className="text-[9px] text-ql-on-surface-variant uppercase tracking-widest font-bold">
                    Session
                  </span>
                  {lo ? (
                    <span className="flex items-center gap-1 text-[9px] text-ql-tertiary font-bold shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-ql-tertiary" />
                      Last run
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-xs font-mono text-ql-on-surface leading-snug break-words"
                  title={lo ? lo.at : undefined}
                >
                  {objectiveLabel(displayObjective)}
                </p>
                <p className="text-[10px] text-ql-on-surface-variant leading-snug">
                  {displayTickerCount} ticker{displayTickerCount === 1 ? "" : "s"}
                  {lo ? (
                    <span className="text-ql-on-surface-variant/70">
                      {" "}
                      · {lastRunLabel}
                    </span>
                  ) : null}
                </p>
                {currentDiffersFromLast ? (
                  <p className="text-[9px] text-ql-on-surface-variant leading-snug pt-1 border-t border-ql-outline-variant">
                    Current: {objectiveLabel(session.objective)} ·{" "}
                    {session.tickers.length} ticker
                    {session.tickers.length === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            )}

            <button
              type="button"
              onClick={cycle}
              className={`flex items-center rounded-lg text-xs font-bold text-ql-on-surface-variant border border-transparent hover:bg-ql-surface-container hover:border-ql-outline-variant transition-colors shrink-0 ${
                sidebarCollapsed
                  ? "justify-center w-full p-2.5"
                  : "gap-2 w-full px-3 py-2.5"
              }`}
              title={`Theme: ${themeMeta.label}. Click to cycle.`}
            >
              <span className="material-symbols-outlined text-base shrink-0">
                {themeMeta.icon}
              </span>
              {!sidebarCollapsed ? (
                <span className="truncate">{themeMeta.label}</span>
              ) : null}
            </button>

            <Link
              href="/portfolio"
              title="Portfolio Lab"
              className={`flex items-center justify-center w-full no-underline primary-gradient text-[#001D33] font-bold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-ql-primary/10 ${
                sidebarCollapsed ? "py-2.5 px-0" : "gap-1.5 py-3 text-sm"
              }`}
            >
              <span className="material-symbols-outlined text-lg shrink-0">
                science
              </span>
              {!sidebarCollapsed ? <span>PL</span> : null}
            </Link>
            <a
              href="/api/docs/openapi"
              target="_blank"
              rel="noopener"
              title="API Docs (OpenAPI)"
              className={`flex items-center text-ql-on-surface-variant hover:text-ql-on-surface transition-colors no-underline shrink-0 ${
                sidebarCollapsed ? "justify-center p-1" : "gap-3 text-xs"
              }`}
            >
              <span className="material-symbols-outlined text-sm shrink-0">
                code
              </span>
              {!sidebarCollapsed ? <span>API Docs</span> : null}
            </a>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="app-shell-mobile-header md:hidden bg-ql-surface flex justify-between items-center px-4 h-14 sticky top-0 z-40 border-b border-ql-outline-variant">
        <Link
          href="/dashboard"
          className="font-headline text-ql-primary text-xl font-bold tracking-tighter no-underline"
        >
          QL
        </Link>
      </header>

      {/* Main — light mode negative space: see globals.css html.light .app-shell-main */}
      <main
        data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
        className={`app-shell-main min-h-screen bg-ql-surface text-ql-on-surface pb-24 md:pb-8 transition-[margin] duration-200 ease-out ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="app-shell-mobile-nav md:hidden fixed bottom-0 left-0 w-full bg-ql-surface-container flex justify-around items-center h-16 border-t border-ql-outline-variant z-50">
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 no-underline ${
              pathname.startsWith(item.href)
                ? "text-ql-primary"
                : "text-ql-on-surface-variant"
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-[10px] font-bold">{item.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
