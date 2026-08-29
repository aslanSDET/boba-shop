"use client";

import { useEffect, useState } from "react";
import type { OpenState } from "@/lib/clover-hours";
import { cn } from "@/lib/utils";

/**
 * Open / closed, from the shop's own Clover hours.
 *
 * Fetched rather than server-rendered because the page is otherwise static and
 * a build-time answer would be wrong within the hour. It is one request, and
 * the route caches for a minute.
 *
 * ── SILENCE IS A VALID ANSWER ────────────────────────────────────────────────
 *
 * `open: null` means we could not find out — no hours published, or Clover
 * unreachable — and the badge renders nothing at all. A shop whose hours we
 * cannot read is not a closed shop, and a wrong CLOSED costs real orders in a
 * way a missing badge never does.
 *
 * Nothing is shown while loading either. A badge that says OPEN NOW and then
 * flips to CLOSED is worse than one that arrives a moment late.
 */
export function OpenBadge() {
  const [state, setState] = useState<OpenState | null>(null);

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

  if (!state || state.open === null) return null;

  return (
    <span
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2"
      title={state.todayLabel ? `Today ${state.todayLabel}` : undefined}
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
    </span>
  );
}
