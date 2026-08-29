"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { advance, openAt, type HoursPayload } from "@/lib/clover-hours";
import { cn } from "@/lib/utils";

/**
 * Open / closed, from the shop's own Clover hours, with the week behind it.
 *
 * ── ONE REQUEST, AND THE CLOCK RUNS HERE ─────────────────────────────────────
 *
 * The route sends the schedule plus the shop's local time as an anchor. This
 * ticks the anchor forward locally and recomputes with `openAt`, a pure
 * function, so the badge flips exactly at closing time without ever asking
 * again. Elapsed time is measured with `performance.now()`, which is monotonic
 * and immune to a visitor's clock being wrong or changing under us — only the
 * ELAPSED time comes from the device, never the absolute time.
 *
 * That is the whole reason the schedule and the verdict were separated: the
 * schedule changes twice a year, the verdict every minute, and conflating them
 * meant a Clover call every minute forever.
 *
 * ── SILENCE IS A VALID ANSWER ────────────────────────────────────────────────
 *
 * An empty week means we could not find out — none published, or Clover
 * unreachable — and nothing renders. A shop whose hours we cannot read is not a
 * closed shop, and a wrong CLOSED costs real orders in a way a missing badge
 * never does. Nothing renders while loading either: OPEN NOW flipping to CLOSED
 * is worse than arriving a moment late.
 *
 * ── THE PANEL IS A BUTTON, NOT A TOOLTIP ─────────────────────────────────────
 *
 * `title` did this job badly: a native tooltip waits a second, never appears on
 * touch, and cannot be reached from the keyboard — which for a shop's opening
 * hours is most of the audience.
 */
export function OpenBadge() {
  const [data, setData] = useState<HoursPayload | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [showWeek, setShowWeek] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hours")
      .then((r) => r.json())
      .then((payload: HoursPayload) => {
        if (cancelled) return;
        startedAt.current = performance.now();
        setData(payload);
      })
      .catch(() => {
        // Deliberately silent: see the note above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.anchor) return;
    // Half-minute ticks so the flip is never more than 30s late, and the work
    // is one comparison against an array of seven.
    const id = setInterval(() => {
      setMinutes(Math.floor((performance.now() - startedAt.current) / 60000));
    }, 30_000);
    return () => clearInterval(id);
  }, [data]);

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

  const state = useMemo(() => {
    if (!data?.anchor) return { open: null as boolean | null, detail: null };
    const now = advance(data.anchor, minutes);
    return openAt(data.week, now.day, now.clock);
  }, [data, minutes]);

  if (!data || state.open === null) return null;
  const hasWeek = data.week.length > 0;

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
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-40 w-max -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-[0_8px_28px_rgba(0,0,0,0.09)]">
          <span className="mb-2 block font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {/* Naming the shop is the reassuring part: these are its own hours. */}
            Hours · Billerica
          </span>
          {data.week.map((day) => {
            const today = data.anchor
              ? advance(data.anchor, minutes).day === day.key
              : false;
            return (
              <span
                key={day.key}
                className={cn(
                  "flex items-baseline justify-between gap-6 py-0.5 font-mono text-[12px] tabular-nums",
                  today ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{day.label}</span>
                <span>{day.hours ?? "Closed"}</span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
