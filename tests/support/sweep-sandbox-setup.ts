/**
 * Marks when this run began, so the teardown's sweep can only ever touch orders
 * this run is responsible for. See `sweep-sandbox.ts` for why that matters.
 */
export const STARTED_AT_KEY = "SNOWDAES_SWEEP_STARTED_AT";

export default async function globalSetup() {
  process.env[STARTED_AT_KEY] = String(Date.now());
}
