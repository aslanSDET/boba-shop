"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenState } from "@/lib/clover-hours";
import { cn } from "@/lib/utils";

/**
 * Open / closed, from the shop's own Clover hours, with the week behind it.
 *
 * Fetched rather than server-rendered because the page is otherwise static and
 * a build-time answer would be wrong within the hour. One request; the route
 * caches for a minute and returns the whole week, so opening the panel costs
 * nothing.
 *
 * ── SILENCE IS A VALID ANSWER ────────────────────────────────────────────────
 *
 * `open: null` means we could not find out — no hours published, or Clover
 * unreachable — and the badge renders nothing at all. A shop whose hours we
 * cannot read is not a closed shop, and a wrong CLOSED costs real orders in a
 * way a missing badge never does. Nothing renders while loading either: a badge
 * that says OPEN NOW and then flips to CLOSED is worse than one that arrives a
 * moment late.
 *
 * ── THE PANEL IS A BUTTON, NOT A TOOLTIP ─────────────────────────────────────
 *
 * `title` was doing this job and doing it badly: a native tooltip waits a
 * second, never appears on touch, and cannot be reached from the keyboard —
 * which on a shop's opening hours is most of the audience. This opens on hover
 * AND on focus AND on tap, closes on Escape and on click-away, and the trigger
 * is a real button so a screen reader announces the state rather than reading
 * an orphaned string.
 */
export function OpenBadge() {
  const [state, setState] = useState<OpenState | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hours")
      .then((r) => r.json())
      .then((data: OpenState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        // Deliberately silent: see the note above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showWeek) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowWeek(false);
    const onDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setShowWeek(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [showWeek]);

  if (!state || state.open === null) return null;
  const hasWeek = state.week.length > 0;

  return (
    <span
      ref={wrapper}
      className="relative"
      onMouseEnter={() => hasWeek && setShowWeek(true)}
      onMouseLeave={() => setShowWeek(false)}
    >
      <button
        type="button"
        aria-expanded={hasWeek ? showWeek : undefined}
        onFocus={() => hasWeek && setShowWeek(true)}
        onClick={() => hasWeek && setShowWeek((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2",
          "font-mono text-[11px] tracking-wide uppercase transition-colors",
          hasWeek && "hover:border-primary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            state.open ? "bg-[#4f9d3a]" : "bg-muted-foreground",
          )}
        />
        {state.open ? "Open now" : "Closed"}
        {state.detail && (
          <span className="text-muted-foreground normal-case">· {state.detail}</span>
        )}
      </button>

      {showWeek && hasWeek && (
        <span
          role="table"
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-40 w-max -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-[0_8px_28px_rgba(0,0,0,0.09)]"
        >
          <span className="mb-2 block font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {/* The label names the source, which is the reassuring part: these
                are the shop's own hours, not ours. */}
            Hours · Billerica
          </span>
          {state.week.map((day) => (
            <span
              role="row"
              key={day.label}
              className={cn(
                "flex items-baseline justify-between gap-6 py-0.5 font-mono text-[12px] tabular-nums",
                day.today ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <span role="cell">{day.label}</span>
              <span role="cell">{day.hours ?? "Closed"}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
