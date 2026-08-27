import { Phone } from "lucide-react";
import { LOCATIONS, SHOP, SOCIALS } from "@/config/shop";
import { Wordmark } from "@/components/wordmark";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
} from "@/components/social-icons";

const SOCIAL_ICON = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
} as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr] md:gap-10">
          {/* Brand */}
          <div>
            <p className="text-[2rem] leading-none">
              {/* 2rem heading, so the mark renders at ~21px. Below the fold. */}
              <Wordmark sizes="24px" loading="eager" />
            </p>
            <p className="mt-4 font-display text-lg text-brand-ink italic">
              {SHOP.tagline}
            </p>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
              {SHOP.about}
            </p>
          </div>

          {/* Locations */}
          <div id="locations" className="scroll-mt-24">
            <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase">
              Locations
            </h2>
            <ul className="mt-5 flex flex-col gap-6">
              {LOCATIONS.map((loc) => (
                <li key={loc.id}>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold">
                    {loc.city}
                    {loc.isNew && (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[9px] tracking-[0.16em] text-primary-foreground uppercase">
                        Now open
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                    {loc.street}
                    <br />
                    {loc.cityLine}
                  </p>
                  {/* min-h-11: the one link customers tap while moving. At text
                      size alone it was 19.5px — under even the 24px AA floor. */}
                  <a
                    href={`tel:${loc.phone.replace(/-/g, "")}`}
                    className="mt-1 inline-flex min-h-11 items-center gap-2 font-mono text-[13px] tabular-nums transition-colors hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
                  >
                    <Phone className="size-3.5" />
                    {loc.phone}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase">
              Follow
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {SOCIALS.map((social) => {
                const Icon = SOCIAL_ICON[social.id];
                return (
                  <li key={social.id}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group inline-flex items-center gap-3 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
                    >
                      <span className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="text-[15px]">
                        {social.label}
                        <span className="ml-2 font-mono text-[13px] text-muted-foreground">
                          {social.handle}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 font-mono text-[11px] tracking-wide text-muted-foreground uppercase sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {SHOP.established}–{new Date().getFullYear()} Snowdaes LLC
          </p>
          <p>Pickup only · Prices before tax</p>
        </div>
      </div>
    </footer>
  );
}
