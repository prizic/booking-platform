"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/cn.js";
import { LOCALE_COOKIE, THEME_COOKIE, preferenceCookie } from "../preferences.js";
import { Button } from "./button.js";

/** Light/dark switch. Renders nothing when the brand has no dark palette. */
export function ThemeToggle({
  initialTheme,
  labels,
  className,
  variant = "ghost",
}: {
  initialTheme: "light" | "dark";
  labels: { toDark: string; toLight: string };
  className?: string;
  variant?: "ghost" | "outline" | "rail";
}) {
  const [theme, setTheme] = useState(initialTheme);
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? labels.toDark : labels.toLight;

  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
      className={cn(variant === "rail" && "justify-center", className)}
      onClick={() => {
        document.documentElement.classList.toggle("dark", next === "dark");
        document.cookie = preferenceCookie(THEME_COOKIE, next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

export interface LocaleOption {
  readonly locale: string;
  readonly href: string;
  /** The language's own name, e.g. "العربية" or "English". */
  readonly label: string;
  readonly current: boolean;
}

/** Segmented language switch. Remembers the choice so `/` reopens in it. */
export function LocaleSwitch({
  options,
  label,
  className,
  tone = "default",
}: {
  options: readonly LocaleOption[];
  label: string;
  className?: string;
  tone?: "default" | "rail";
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg p-1",
        tone === "rail" ? "bg-rail-accent" : "bg-neutral-2",
        className,
      )}
    >
      {options.map((option) => (
        <a
          key={option.locale}
          href={option.href}
          lang={option.locale}
          hrefLang={option.locale}
          aria-current={option.current ? "true" : undefined}
          onClick={() => {
            document.cookie = preferenceCookie(LOCALE_COOKIE, option.locale);
          }}
          className={cn(
            "inline-flex h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            tone === "rail"
              ? "text-rail-muted hover:text-rail-foreground aria-[current=true]:bg-rail aria-[current=true]:text-rail-foreground"
              : "text-muted-foreground hover:text-foreground aria-[current=true]:bg-card aria-[current=true]:text-foreground aria-[current=true]:shadow-sm",
          )}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}
