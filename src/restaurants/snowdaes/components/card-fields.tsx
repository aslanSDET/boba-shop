"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/restaurants/snowdaes/lib/utils";

/**
 * Card entry, and nothing else.
 *
 * ── THE CARD NEVER TOUCHES THIS APP ──────────────────────────────────────────
 *
 * Each field below is an iframe served by Clover, mounted into an empty span we
 * own. The digits are typed in a different origin; we receive a single-use
 * `clv_` token and nothing else. There is deliberately no state anywhere here
 * holding anything card-shaped, and there must not be — one "let me just read
 * the value out of the field" undoes the entire arrangement and drags this
 * project into PCI scope.
 *
 * Three traps are paid for in here, all from `scripts/spike/prior-art.md`:
 * `mount()` takes a CSS SELECTOR and silently fails the whole mount if handed a
 * node; a React `useId()` contains colons, so `#:r1:` is a selector syntax
 * error and the ids below are plain strings; and a `clv_` token is single-use,
 * so a retry after a decline has to tokenise again rather than reuse one.
 *
 * ── WHY IT IS ITS OWN COMPONENT NOW ──────────────────────────────────────────
 *
 * It used to be half of `checkout-panel.tsx`, which also did the pricing, the
 * totals and the confirmation. Checkout is a full page now, with a tip, a
 * pickup time and a note around it — and the one part of that page where a
 * careless edit has regulatory consequences is this one. Keeping it separate,
 * small, and free of anything but the card is what stops it drifting.
 */

// Plain ids on purpose: Clover mounts by selector, and useId() yields colons.
const FIELDS = [
  { key: "CARD_NUMBER", id: "clover-card-number", label: "Card number" },
  { key: "CARD_DATE", id: "clover-card-date", label: "Expiry" },
  { key: "CARD_CVV", id: "clover-card-cvv", label: "CVV" },
  { key: "CARD_POSTAL_CODE", id: "clover-card-postal", label: "Postal code" },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloverSdk = any;

export interface CardHandle {
  /**
   * A fresh single-use token, or an explanation of why not.
   *
   * Never returns a token it has returned before: Clover spends them on use, so
   * a retry after a decline must tokenise again.
   */
  tokenize: () => Promise<{ token?: string; error?: string }>;
}

export function CardFields({
  ref,
  onReady,
  onError,
}: {
  ref: React.Ref<CardHandle>;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const cloverRef = useRef<CloverSdk>(null);
  const mountedRef = useRef(false);
  /** Per-field messages from Clover's own validation, keyed by element id. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* Effects must not depend on these, or remounting the iframes becomes a
     side effect of the parent re-rendering — which loses whatever the customer
     has already typed. */
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    (async () => {
      try {
        const config = await (await fetch("/api/clover/checkout/config")).json();
        if (!config.publicKey) throw new Error(config.error ?? "No key");

        await new Promise<void>((resolve, reject) => {
          if (document.querySelector(`script[src="${config.sdkUrl}"]`)) return resolve();
          const script = document.createElement("script");
          script.src = config.sdkUrl;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Clover SDK failed to load"));
          document.head.appendChild(script);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Clover = (window as any).Clover;
        if (!Clover) throw new Error("Clover SDK did not define itself");

        const clover = new Clover(config.publicKey, { merchantId: config.merchantId });
        cloverRef.current = clover;
        const elements = clover.elements();

        for (const field of FIELDS) {
          // A SELECTOR, never the node. Handing it an element fails the whole
          // mount and the only evidence is a generic message.
          const element = elements.create(field.key, {});
          element.mount(`#${field.id}`);

          // Clover validates inside its own iframe and reports through this
          // event — it is the only way to tell somebody their card number is
          // short, because we cannot read the field. Without it a bad card just
          // sat there and the Pay button did nothing visible.
          //
          // The payload has been documented both as { CARD_NUMBER: { error } }
          // and as a bare { error }, so both are read rather than betting on
          // one and silently showing nothing.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          element.addEventListener("change", (event: any) => {
            const detail = event?.[field.key] ?? event ?? {};
            const message: string | undefined = detail.error || undefined;
            setFieldErrors((prev) => {
              if (!message) {
                if (!prev[field.id]) return prev;
                const next = { ...prev };
                delete next[field.id];
                return next;
              }
              if (prev[field.id] === message) return prev;
              return { ...prev, [field.id]: message };
            });
          });
        }

        onReadyRef.current();
      } catch (e) {
        onErrorRef.current(e instanceof Error ? e.message : "Card fields could not load.");
      }
    })();
  }, []);

  const tokenize = useCallback(async (): Promise<{ token?: string; error?: string }> => {
    if (!cloverRef.current) return { error: "The card form is not ready yet." };
    if (Object.keys(fieldErrors).length > 0) return { error: "Fix the card details above first." };

    const result = await cloverRef.current.createToken();

    if (result?.errors) {
      // createToken reports the same per-field shape. Put each message under
      // the box it belongs to rather than showing one of them at the bottom
      // and leaving the customer to guess which field is wrong.
      const mapped: Record<string, string> = {};
      for (const field of FIELDS) {
        const message = result.errors[field.key];
        if (typeof message === "string" && message) mapped[field.id] = message;
      }
      setFieldErrors((prev) => ({ ...prev, ...mapped }));
      const leftover = Object.values(result.errors).filter(
        (v): v is string => typeof v === "string",
      );
      return {
        error:
          Object.keys(mapped).length > 0
            ? undefined
            : (leftover[0] ?? "Check the card details."),
      };
    }
    if (!result?.token) return { error: "Clover did not return a card token." };
    return { token: result.token };
  }, [fieldErrors]);

  useImperativeHandle(ref, () => ({ tokenize }), [tokenize]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map((field) => (
        <label
          key={field.id}
          className={cn("flex flex-col gap-1.5", field.key === "CARD_NUMBER" && "col-span-2")}
        >
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {field.label}
          </span>
          {/* Clover mounts its iframe in here. Never populated by us. */}
          {/* Clover sizes its own iframe. Our box gives it a fixed height and
              no padding — adding our own made every field taller than the
              sheet could show and pushed the Pay button off-screen. */}
          <span
            id={field.id}
            className={cn(
              "block h-[46px] overflow-hidden rounded-2xl border bg-card px-3 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0",
              fieldErrors[field.id] ? "border-destructive" : "border-border",
            )}
          />
          {fieldErrors[field.id] && (
            <span role="alert" className="text-[12px] text-destructive">
              {fieldErrors[field.id]}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
