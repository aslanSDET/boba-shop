/**
 * Where Square's credentials come from, in each place this code runs.
 *
 * A near-copy of `pos/clover/creds.ts`, deliberately, for the reason in
 * `PLATFORM.md` §3: this is the second case, not the third, so it is duplicated
 * rather than abstracted. The two differ in exactly one thing — the parameter
 * path — and that is not yet enough shape to extract.
 *
 * The reasoning it inherits, in short: Amplify Hosting's environment variables
 * are build-time only, and AWS's documented workaround writes them into the
 * deployment artifact, which their own page warns is readable by anyone with
 * access to it. So credentials come from SSM Parameter Store at request time,
 * read by the deployment's IAM role. `pos/clover/creds.ts` has the long version.
 *
 * `process.env` wins over Parameter Store, which is what keeps local
 * development unchanged: `.env.local` still works and nothing reaches the
 * fallback unless a name is genuinely absent.
 *
 * ── NAMING ───────────────────────────────────────────────────────────────────
 *
 * The code asks for `SQUARE_ACCESS_TOKEN`. `.env.local` currently holds
 * `SQUARE_SANDBOX_ACCESS_TOKEN`, from before there was any code to read it, so
 * that name is accepted as a fallback rather than requiring the file to be
 * edited. The environment-suffixed name is the odd one out — `SQUARE_ENV`
 * already says which environment we are in, and baking it into the credential
 * name means the production cutover is two edits instead of one.
 */

const ALIASES: Record<string, string[]> = {
  SQUARE_ACCESS_TOKEN: ["SQUARE_ACCESS_TOKEN", "SQUARE_SANDBOX_ACCESS_TOKEN"],
  SQUARE_APPLICATION_ID: ["SQUARE_APPLICATION_ID", "SQUARE_SANDBOX_APPLICATION_ID"],
  SQUARE_LOCATION_ID: ["SQUARE_LOCATION_ID", "SQUARE_SANDBOX_LOCATION_ID"],
};

let inFlight: Promise<Record<string, string>> | null = null;

function prefix(): string {
  const raw = process.env.SQUARE_SSM_PREFIX ?? "/boba-shop/asian-kitchen/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

async function fromParameterStore(): Promise<Record<string, string>> {
  const { SSMClient, GetParametersByPathCommand } = await import("@aws-sdk/client-ssm");
  const client = new SSMClient({});
  const path = prefix();
  const out: Record<string, string> = {};
  let token: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({ Path: path, WithDecryption: true, NextToken: token }),
    );
    for (const p of page.Parameters ?? []) {
      if (p.Name && p.Value) out[p.Name.slice(path.length)] = p.Value;
    }
    token = page.NextToken;
  } while (token);
  return out;
}

function load(): Promise<Record<string, string>> {
  if (inFlight) return inFlight;
  inFlight = fromParameterStore().catch((error) => {
    inFlight = null;
    throw error;
  });
  return inFlight;
}

/** One credential, by its canonical name. Throws with the name, never the value. */
export async function credential(name: string): Promise<string> {
  const names = ALIASES[name] ?? [name];

  for (const n of names) {
    const fromEnv = process.env[n];
    if (fromEnv) return fromEnv;
  }

  let store: Record<string, string> = {};
  try {
    store = await load();
  } catch {
    // Fall through to the same message as a plain miss — a deployment with no
    // Square configured and a deployment whose SSM read failed are the same
    // thing from the caller's side, and the detail is in the server log.
  }

  for (const n of names) {
    if (store[n]) return store[n];
  }

  throw new Error(
    `Missing ${name}. Locally: add it to .env.local (gitignored). ` +
      `Deployed: put it at ${prefix()}${name} as a SecureString parameter.`,
  );
}

/** True when Square is configured at all — lets a route answer 503 rather than throw. */
export async function isConfigured(): Promise<boolean> {
  try {
    await credential("SQUARE_ACCESS_TOKEN");
    return true;
  } catch {
    return false;
  }
}
