import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Snowdaes builds to `.next-snowdaes` (NEXT_DIST_DIR, see
    // playwright.snowdaes.config.ts), which the default `.next/**` above does
    // not cover. Unignored, `npm run lint` walked 209 files of build output and
    // reported 566 errors in generated chunks — enough noise to bury the one
    // real warning in src/ and make the command useless as a gate.
    ".next-*/**",
    // Someone else's design tokens, extracted for one afternoon's reading and
    // deliberately kept out of git (see .gitignore). Not ours to fix.
    "research/**",
    // Seeded design-canvas payloads: ~2.9 MB of generated editor code each.
    "design/**",
  ]),
]);

export default eslintConfig;
