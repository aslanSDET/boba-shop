/**
 * Where Asian Kitchen's menu photography comes from, in each place this runs.
 *
 * ── WHY THE PHOTOS ARE NOT IN THE REPO ───────────────────────────────────────
 *
 * They came from a third-party ordering listing, may be subject to third-party
 * copyright, and have not been cleared with the owner (docs/ASIAN-KITCHEN.md
 * §4). `.gitignore` keeps `/public/asian-kitchen/menu/` out deliberately, and
 * this is a PUBLIC repository — committing 9.5MB of someone else's photography
 * to it is republishing, not caching.
 *
 * That was invisible until the site was deployed. Locally the files sit on disk
 * from `scripts/asian-kitchen/fetch-photos.mjs` and every tile looks right; the
 * deployed build has no such files, and all 45 photographed items 404'd.
 *
 * ── THE ARRANGEMENT ──────────────────────────────────────────────────────────
 *
 * The photos live in a private S3 bucket, and this module reads them with the
 * deployment's own IAM role. The bucket blocks public access — an anonymous GET
 * against the object URL returns 403 — so the images are reachable only through
 * this route, which sits behind the same basic auth as the rest of the site.
 * Nothing is redistributed in git and nothing is published to the open web.
 *
 * When the owner clears the rights, the honest fix is to commit them (or to
 * take our own photographs) and delete this file along with the bucket.
 *
 * ── PRECEDENCE: DISK FIRST, THEN S3 ──────────────────────────────────────────
 *
 * Same shape as `pos/clover/creds.ts`, for the same reason. If the file is on
 * disk it is served from disk, so `npm run dev` needs no AWS credentials, no
 * network, and behaves exactly as it did before this existed. S3 is consulted
 * only when the file is absent, which in practice means only in the cloud.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const BUCKET = process.env.ASIAN_KITCHEN_PHOTO_BUCKET;

/** Only ever a bare filename. Anything with a separator is a traversal attempt. */
export function isSafeName(file: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(file) && !file.startsWith(".");
}

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".avif": "image/avif",
  ".webp": "image/webp",
};

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

async function fromDisk(file: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), "public/asian-kitchen/menu", file));
  } catch {
    return null;
  }
}

async function fromS3(file: string): Promise<Uint8Array | null> {
  if (!BUCKET) return null;
  // Imported lazily so a local run with the photos on disk never loads the SDK.
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const res = await new S3Client({}).send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `menu/${file}` }),
    );
    return res.Body ? await res.Body.transformToByteArray() : null;
  } catch {
    // A missing photo is a missing photo. The tile has an "AK" fallback and the
    // page is fine without it; a 500 here would be a worse answer than a 404.
    return null;
  }
}

export async function readPhoto(file: string): Promise<Uint8Array | null> {
  return (await fromDisk(file)) ?? (await fromS3(file));
}
