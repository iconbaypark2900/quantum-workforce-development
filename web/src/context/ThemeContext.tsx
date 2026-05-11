"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ql-theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "dark",
  setPreference: () => {},
  cycle: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function applyToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  /* color-scheme comes from globals.css (html / html.light) — avoid inline style on <html> (hydration mismatch). */
}

const CYCLE_ORDER: ThemePreference[] = ["dark", "light", "system"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readStored();
      setPreferenceState(stored);
      const r = resolve(stored);
      setResolved(r);
      applyToDocument(r);
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (preference !== "system") return;
      const r = getSystemTheme();
      setResolved(r);
      applyToDocument(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    localStorage.setItem(STORAGE_KEY, p);
    const r = resolve(p);
    setResolved(r);
    applyToDocument(r);
  }, []);

  const cycle = useCallback(() => {
    setPreferenceState((prev) => {
      const idx = CYCLE_ORDER.indexOf(prev);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      localStorage.setItem(STORAGE_KEY, next);
      const r = resolve(next);
      setResolved(r);
      applyToDocument(r);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
