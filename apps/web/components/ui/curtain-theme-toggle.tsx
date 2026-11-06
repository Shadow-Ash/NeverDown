"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type Theme = "light" | "dark";

export interface AppBarProps {
  logo?: ReactNode;
  appName?: string;
  onSearch?: (query: string) => void;
  userAvatar?: ReactNode;
  userName?: string;
}

export interface ThemeToggleProps {
  variant?: "default" | "appbar" | "icon";
  appBarProps?: AppBarProps;
  defaultTheme?: Theme;
  barHeight?: number;
  buttonSize?: number;
  duration?: number;
  onThemeChange?: (theme: Theme) => void;
  children?: ReactNode;
}

const colors = {
  light: { page: "#f3f0e7", text: "#1e1e1e", bar: "#2a2529", barText: "#f3f0e7" },
  dark: { page: "#2a2529", text: "#f3f0e7", bar: "#f3f0e7", barText: "#2a2529" },
};

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "light" ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  );
}

export function ThemeToggle({ variant = "default", appBarProps, defaultTheme = "light", barHeight, buttonSize = 36, duration = 550, onThemeChange, children }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [phase, setPhase] = useState<"idle" | "falling" | "rising">("idle");
  const nextColor = useRef(colors.dark.page);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const height = barHeight ?? (variant === "appbar" ? 60 : 44);
  const palette = colors[theme];

  useEffect(() => {
    const saved = window.localStorage.getItem("nd-theme");
    const initial = saved === "light" || saved === "dark" ? saved : document.documentElement.classList.contains("dark") ? "dark" : defaultTheme;
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.dataset.theme = initial;
    return () => timers.current.forEach(clearTimeout);
  }, [defaultTheme]);

  const toggle = useCallback(() => {
    if (phase !== "idle") return;
    const next: Theme = theme === "light" ? "dark" : "light";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const change = () => {
      setTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("nd-theme", next);
      onThemeChange?.(next);
    };
    if (reduced) { change(); return; }
    nextColor.current = colors[next].page;
    setPhase("falling");
    timers.current.push(setTimeout(() => {
      change();
      setPhase("rising");
      timers.current.push(setTimeout(() => setPhase("idle"), duration));
    }, duration));
  }, [duration, onThemeChange, phase, theme]);

  const curtain: CSSProperties = {
    position: "fixed", inset: 0, zIndex: 9997, pointerEvents: "none", background: nextColor.current,
    transform: phase === "falling" ? "scaleY(1)" : "scaleY(0)",
    transformOrigin: phase === "rising" ? "bottom" : "top",
    transition: phase === "idle" ? "none" : `transform ${duration}ms cubic-bezier(.76,0,.24,1)`,
  };
  const button: CSSProperties = {
    width: buttonSize, height: buttonSize, flexShrink: 0, borderRadius: "50%", border: 0,
    background: palette.page, color: palette.text, cursor: "pointer", display: "grid", placeItems: "center",
  };
  const control = <button type="button" style={button} onClick={toggle} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} aria-pressed={theme === "dark"}><ThemeIcon theme={theme} /></button>;

  if (variant === "icon") return <><div aria-hidden="true" style={curtain} />{control}</>;

  return <div style={{ minHeight: "100vh", paddingTop: height, background: palette.page, color: palette.text }}>
    <div aria-hidden="true" style={curtain} />
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, height, zIndex: 9998, background: palette.bar, color: palette.barText, display: "flex", alignItems: "center", justifyContent: variant === "appbar" ? "space-between" : "center", padding: variant === "appbar" ? "0 24px" : 0 }}>
      {variant === "appbar" && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{appBarProps?.logo}<strong>{appBarProps?.appName}</strong></div>}
      {variant === "appbar" && appBarProps?.onSearch && <input type="search" aria-label="Search" placeholder="Search..." onChange={event => appBarProps.onSearch?.(event.target.value)} />}
      {variant === "appbar" && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{appBarProps?.userName}{appBarProps?.userAvatar}{control}</div>}
      {variant === "default" && <div style={{ transform: `translateY(${height / 2}px)` }}>{control}</div>}
    </header>
    {children}
  </div>;
}
