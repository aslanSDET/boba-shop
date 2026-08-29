import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` refuses cross-origin requests for its own dev resources, so
   * reaching this machine through a tunnel returns 403 on every asset and the
   * page arrives unstyled and inert — which reads as "nothing is clickable"
   * rather than as a network refusal.
   *
   * Needed because the proof of concept gets demonstrated on a phone, and on
   * the shop's wifi rather than this laptop's localhost. It is a DEV-only
   * allowance; `next build` ignores it, so nothing here widens what a deployed
   * site accepts.
   *
   * ngrok mints a new hostname per free-tier session — if the tunnel is
   * restarted, this string changes with it.
   */
  allowedDevOrigins: ["gear-mountain-antiques.ngrok-free.dev"],
};

export default nextConfig;
