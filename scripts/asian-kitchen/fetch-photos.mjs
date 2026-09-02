/**
 * Download Asian Kitchen's menu photography into `public/asian-kitchen/menu/`.
 *
 * ── WHY THE MANIFEST IS SEPARATE FROM THIS SCRIPT ────────────────────────────
 *
 * The listing's HTML returns 403 to anything that is not a browser, so the
 * name → image mapping cannot be fetched from a script. It was harvested once,
 * by hand, out of the page's server-rendered payload and frozen into
 * `photo-manifest.json`. The images themselves live on a public S3 bucket and
 * download fine, which is the only part worth automating.
 *
 * Re-harvesting the manifest is a browser job. This script is the repeatable half.
 *
 * ── THESE PHOTOGRAPHS ARE ON LOAN ────────────────────────────────────────────
 *
 * They were downloaded from a third-party ordering listing and may be subject
 * to someone else's copyright. They are here so the proof of concept has
 * something to show. Clear or replace them before a public deployment
 * (docs/ASIAN-KITCHEN.md §4). Every file lands under a directory that is
 * gitignored for exactly that reason.
 *
 * ── THE CDN HOST IS NOT IN THE REPO ──────────────────────────────────────────
 *
 * This is a public repo and the host names the platform, so it lives in the
 * environment rather than in `photo-manifest.json`:
 *
 *   PHOTO_CDN_BASE="https://<host>/media/" node scripts/asian-kitchen/fetch-photos.mjs
 *
 * Everything already downloaded is unaffected — this is only needed to re-fetch.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const OUT = resolve(ROOT, "public/asian-kitchen/menu");

/** Kebab-case, ASCII-folded, so `Jalapeño Cheesesteak` becomes a safe filename. */
const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const manifest = JSON.parse(await readFile(resolve(HERE, "photo-manifest.json"), "utf8"));
const { _folders: FOLDERS, photos } = manifest;

const BASE = process.env.PHOTO_CDN_BASE;
if (!BASE) {
  console.error(
    "PHOTO_CDN_BASE is not set. See the header of this file — the CDN host is\n" +
      "deliberately kept out of the repo. Existing downloads are unaffected.",
  );
  process.exit(1);
}

/** `p/abc~.jpg` -> `photosV2/abc-retina-large.jpg` */
function expand(code) {
  const [key, ...rest] = code.split("/");
  const folder = FOLDERS[key];
  if (!folder) throw new Error(`Unknown folder code "${key}" in manifest`);
  return folder + rest.join("/").replace("~", "-retina-large");
}

await mkdir(OUT, { recursive: true });

let saved = 0;
let skipped = 0;
const failed = [];
const index = {};

for (const [name, code] of Object.entries(photos)) {
  const url = BASE + expand(code);
  const ext = (url.match(/\.(jpe?g|png)$/i)?.[1] ?? "jpg").toLowerCase();
  const file = `${slug(name)}.${ext === "jpeg" ? "jpg" : ext}`;
  const dest = resolve(OUT, file);
  index[name] = `/asian-kitchen/menu/${file}`;

  if (existsSync(dest)) {
    skipped++;
    continue;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      failed.push(`${name} — HTTP ${res.status}`);
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    // A CDN error page is small and is not an image; refuse to save one.
    if (body.length < 1024) {
      failed.push(`${name} — only ${body.length} bytes, not an image`);
      continue;
    }
    await writeFile(dest, body);
    saved++;
    process.stdout.write(`  ${file}  ${(body.length / 1024).toFixed(0)}kB\n`);
  } catch (error) {
    failed.push(`${name} — ${error.message}`);
  }
}

// The lookup the app imports. Written every run so it cannot drift from disk.
await writeFile(
  resolve(HERE, "photo-index.json"),
  JSON.stringify(index, null, 2) + "\n",
  "utf8",
);

console.log(`\nsaved ${saved} · already had ${skipped} · failed ${failed.length}`);
if (failed.length) {
  console.log("\nfailed:");
  for (const line of failed) console.log(`  ${line}`);
}
console.log(`\nIndex written to scripts/asian-kitchen/photo-index.json`);
console.log(`Items with no photo fall back to a placeholder — that is expected.`);
