/**
 * Pulls each shop's live Clover catalog and writes it to assets/clover/.
 *
 * Clover's ordering site is a Next.js app that ships the entire catalog inside
 * the RSC flight payload, so there is no API to authenticate against and no
 * need to drive 240 modals: fetch the page, concatenate the
 * `self.__next_f.push([1, "…"])` chunks, and the catalog is a JSON object
 * inside the result.
 *
 * The raw output is committed so that a re-run produces a reviewable diff
 * rather than a thousand-line regeneration. The menu moves - a new Specialty
 * Drink appeared between two runs minutes apart.
 *
 *   node scripts/fetch-clover.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

export const STORES = [
  { id: "billerica", host: "snowdaes-north-billerica.cloveronline.com" },
  { id: "lowell", host: "snowdaes-lowell.cloveronline.com" },
];

/** Concatenate the RSC chunks back into one string. */
function decodeFlight(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:\\.|[^"\\])*)"\]\)/g)];
  let out = "";
  for (const [, raw] of chunks) {
    try {
      out += JSON.parse(`"${raw}"`);
    } catch {
      // A chunk that will not parse on its own is a split escape sequence;
      // skipping it loses nothing we need.
    }
  }
  return out;
}

/**
 * The catalog is not at a known path in the payload, so walk outward from the
 * `modifierGroups` key through enclosing braces until a slice parses AND looks
 * like the catalog.
 */
function extractCatalog(flight) {
  const anchor = flight.indexOf('"modifierGroups":{"');
  if (anchor < 0) throw new Error("no modifierGroups key in payload");
  let start = anchor;
  for (let attempt = 0; attempt < 3000; attempt++) {
    start = flight.lastIndexOf("{", start - 1);
    if (start < 0) break;
    const end = matchBrace(flight, start);
    if (end < 0) continue;
    try {
      const obj = JSON.parse(flight.slice(start, end + 1));
      if (obj?.modifierGroups && obj?.items && obj?.categories) return obj;
    } catch {
      // Not a complete object yet - keep widening.
    }
  }
  throw new Error("could not isolate the catalog object");
}

/** Index of the `}` closing the `{` at `from`, ignoring braces inside strings. */
function matchBrace(s, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

export async function fetchCatalog(store) {
  const res = await fetch(`https://${store.host}/menu/all`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`${store.id}: HTTP ${res.status}`);
  return extractCatalog(decodeFlight(await res.text()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync("assets/clover", { recursive: true });
  for (const store of STORES) {
    const cat = await fetchCatalog(store);
    const path = `assets/clover/${store.id}.json`;
    writeFileSync(path, JSON.stringify(cat, null, 1) + "\n");
    console.log(
      `${store.id.padEnd(10)} ${String(Object.keys(cat.categories).length).padStart(3)} categories  ` +
        `${String(cat.items.length).padStart(4)} items  ` +
        `${String(Object.keys(cat.modifierGroups).length).padStart(3)} groups  ` +
        `${String(cat.modifiers.length).padStart(5)} modifiers  -> ${path}`,
    );
  }
}
