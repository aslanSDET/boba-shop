/**
 * Where the Clover credentials come from, in each place this code runs.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * Amplify Hosting's environment variables are a BUILD-TIME facility. A Next
 * server component or route handler does not see them at request time; AWS says
 * so outright and offers one workaround — append them to `.env.production`
 * during the build, which bakes the value into the deployment artifact. Their
 * own warning on that page: "any user with access to deployment artifacts can
 * read them", and "to give your SSR compute function access to AWS resources,
 * we recommend using IAM roles".
 *
 * A live merchant token sitting readable inside a build artifact is exactly the
 * thing AGENTS.md forbids, so the tokens do not travel that way. They live in
 * SSM Parameter Store as SecureString, and the SSR compute role is granted
 * `ssm:GetParametersByPath` + `kms:Decrypt` on one path and nothing else.
 *
 * Parameter Store rather than Secrets Manager: the Clover token is static and
 * merchant-generated, so rotation — the thing Secrets Manager charges for — is
 * not a feature we would use. Same KMS encryption, same IAM story, no monthly
 * per-secret fee.
 *
 * ── PRECEDENCE: ENVIRONMENT FIRST, ALWAYS ────────────────────────────────────
 *
 * `process.env` wins over Parameter Store. That is deliberate and it is what
 * keeps this change invisible locally: `.env.local` still works, `npm run dev`
 * still works, and every script under `scripts/` is untouched because none of
 * them ever reaches the fallback. Parameter Store is consulted only when a name
 * is absent from the environment, which in practice means only in the cloud.
 *
 * It also means a developer can override one value against a running deployment
 * config without editing anything in AWS.
 */

import { ACTIVE_RESTAURANT } from "@/restaurants/active";

/**
 * One SSM read per Lambda container, not per request.
 *
 * Held as the *promise* rather than the resolved value so that concurrent
 * requests arriving during a cold start share the single in-flight call instead
 * of each firing their own. Cleared on failure so a transient SSM error does not
 * poison the container for its whole lifetime.
 */
let inFlight: Promise<Record<string, string>> | null = null;

/**
 * `/boba-shop/snowdaes/` by default.
 *
 * Keyed by restaurant because PLATFORM.md §2 gives each one its own deployment
 * and its own credentials — there is no path that holds two merchants' tokens.
 * Overridable so a second location (PLAN.md Phase 2b anticipates separate
 * Billerica and Lowell merchant accounts) can point at its own subtree without
 * a code change.
 */
function prefix(): string {
  const raw = process.env.CLOVER_SSM_PREFIX ?? `/boba-shop/${ACTIVE_RESTAURANT}/`;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

async function fromParameterStore(): Promise<Record<string, string>> {
  // Imported lazily so the SDK is never pulled into a path that does not need
  // it — a local run with a complete .env.local never loads this module at all.
  const { SSMClient, GetParametersByPathCommand } = await import("@aws-sdk/client-ssm");

  const client = new SSMClient({});
  const path = prefix();
  const out: Record<string, string> = {};

  // One call returns every credential under the path. Paginated because the API
  // is, not because we expect a second page.
  let token: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        WithDecryption: true,
        NextToken: token,
      }),
    );
    for (const p of page.Parameters ?? []) {
      if (!p.Name || !p.Value) continue;
      out[p.Name.slice(path.length)] = p.Value;
    }
    token = page.NextToken;
  } while (token);

  return out;
}

function load(): Promise<Record<string, string>> {
  if (inFlight) return inFlight;
  inFlight = fromParameterStore().catch((error) => {
    // Do not cache a failure. The next request gets a fresh attempt.
    inFlight = null;
    throw error;
  });
  return inFlight;
}

/**
 * One credential, by the same name it has in `.env.local`.
 *
 * Throws with the name and never the value — this message reaches a log.
 */
export async function credential(name: string): Promise<string> {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;

  let store: Record<string, string>;
  try {
    store = await load();
  } catch (error) {
    throw new Error(
      `Missing ${name}: not in the environment, and reading ${prefix()} from ` +
        `SSM Parameter Store failed (${(error as Error).message}).`,
    );
  }

  const value = store[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Locally: add it to .env.local (gitignored) — see ` +
        `scripts/spike/README.md. Deployed: put it at ${prefix()}${name} as a ` +
        `SecureString parameter.`,
    );
  }
  return value;
}
