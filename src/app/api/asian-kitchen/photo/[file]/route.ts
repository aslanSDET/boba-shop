import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { contentType, isSafeName, readPhoto } from "@/restaurants/asian-kitchen/photos";

/**
 * GET /api/asian-kitchen/photo/<file> — one menu photograph.
 *
 * A thin shim, like everything else in `app/` (AGENTS.md invariant 2). The
 * reason this route exists at all, and why the photographs are not simply
 * static files under `public/`, is in `restaurants/asian-kitchen/photos.ts`.
 *
 * Mirrors `notThisDeployment()` in the Clover routes: these are one
 * restaurant's photographs, so a Snowdaes deployment has no business serving
 * them even though the route is present in every build.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (ACTIVE_RESTAURANT !== "asian-kitchen") {
    return Response.json(
      { error: "This deployment does not serve Asian Kitchen." },
      { status: 404 },
    );
  }

  const { file } = await params;
  if (!isSafeName(file)) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await readPhoto(file);
  if (!bytes) {
    // The tile falls back to the "AK" mark, so a miss is a cosmetic loss.
    return new Response("Not found", { status: 404 });
  }

  /* Re-wrapped rather than passed straight through: `readFile` and the S3 SDK
     both hand back `Uint8Array<ArrayBufferLike>`, which TypeScript will not
     accept as a `BodyInit`. Copying into a plain-backed view is the cheap fix. */
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": contentType(file),
      /* A week, matching customHttp.yml's rule for `public/` assets and for the
         same reason: these are photographs that do not change, served mostly to
         phones on cellular. It also keeps the S3 read — and its Lambda
         invocation — off the repeat visit. */
      "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
    },
  });
}
