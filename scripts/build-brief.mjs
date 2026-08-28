/**
 * Builds the published brief page from CLOVER-AND-LAUNCH.md + docs/brief.tpl.html.
 *
 * The prose lives in the template and the diagrams live in the markdown, so the
 * two can't drift: every ```mermaid block in the markdown is injected, in order,
 * into the matching {{D0}}…{{Dn}} placeholder.
 *
 * Mermaid source is HTML-escaped on the way in. That is not cosmetic — the
 * diagrams contain `<br/>` inside node labels, and an unescaped `<br/>` inside
 * <pre> is parsed as a real element, so mermaid reads the textContent with the
 * line breaks silently stripped out.
 *
 *   node scripts/build-brief.mjs
 *
 * Then publish docs/snowdaes-launch-brief.html as an Artifact. It is currently
 * live at https://claude.ai/code/artifact/3a1c2780-f0fd-4478-98ab-4fdcee69bbf8
 * — republish to that same URL rather than creating a second copy.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MD = "CLOVER-AND-LAUNCH.md";
const TPL = "docs/brief.tpl.html";
const OUT = "docs/snowdaes-launch-brief.html";

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const diagrams = [...readFileSync(MD, "utf8").matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) =>
  m[1].trimEnd(),
);
let html = readFileSync(TPL, "utf8");

const slots = [...html.matchAll(/\{\{D(\d+)\}\}/g)].map((m) => Number(m[1]));
if (slots.length !== diagrams.length) {
  console.error(
    `\n  ✗ ${diagrams.length} mermaid blocks in ${MD} but ${slots.length} slots in ${TPL}.\n` +
      `    Add or remove a {{D<n>}} placeholder so they line up.\n`,
  );
  process.exit(1);
}

diagrams.forEach((src, i) => {
  html = html.replace(`{{D${i}}}`, `<pre class="mermaid">${escape(src)}</pre>`);
});

const left = html.match(/\{\{D\d+\}\}/g);
if (left) {
  console.error(`\n  ✗ unreplaced placeholders: ${left.join(", ")}\n`);
  process.exit(1);
}

writeFileSync(OUT, html);
console.log(`  ✓ ${OUT}  —  ${diagrams.length} diagrams, ${(html.length / 1024).toFixed(1)} KB`);
