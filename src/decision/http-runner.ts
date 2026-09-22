/**
 * Default decision runner: one bare-HTTP call to a System One endpoint
 * (change add-typesafe-decision-hooks, design Decision 5).
 *
 * The interface surface is tiny (state + questions), so a whole SDK is not
 * worth a runtime dependency until the endpoint stabilizes.
 *
 * Two things this module deliberately does NOT invent:
 * - the endpoint host. The evaluation snapshot in `docs/references/jev/`
 *   documents `POST /v1/systemone` but never a base URL, so there is no
 *   default: an endpoint must be configured explicitly. Unverified defaults
 *   are worse than a clear "unavailable".
 * - the credential. The key is read from `TYPESAFE_API_KEY` at *call* time and
 *   never stored in config, logged, or attached to a diagnostic: a rotated key
 *   is picked up without a restart, and a serialized config can never leak it.
 */

import type { DecisionRunner } from "./types.js";

export const TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";
export const TYPESAFE_API_URL_ENV = "TYPESAFE_API_URL";

export interface HttpDecisionRunnerOptions {
  /** Environment read for the key. Defaults to `process.env` at call time. */
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Injected endpoint; the environment overrides it. */
  url?: string;
}

/**
 * Build the default runner. Returns `undefined` when no endpoint is
 * configured, so "not configured" is never read as "ran and failed"; a
 * missing key is reported per call as `{ unavailable }` and classified as
 * `runner-unavailable` by the boundary.
 */
export function createHttpDecisionRunner(
  options: HttpDecisionRunnerOptions = {},
): DecisionRunner | undefined {
  // The environment wins, then an injected endpoint. There is intentionally
  // no default host: an unverified endpoint is a fabricated API contract.
  const url =
    (options.env ?? process.env)[TYPESAFE_API_URL_ENV]?.trim() || options.url?.trim();
  if (!url || url.length === 0) return undefined;

  return async (input) => {
    const apiKey = (options.env ?? process.env)[TYPESAFE_API_KEY_ENV]?.trim();
    if (!apiKey || apiKey.length === 0)
      return {
        unavailable: "missing-api-key",
      };
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(url, {
      body: JSON.stringify({
        questions: input.questions,
        state: input.state,
      }),
      method: "POST",
      signal: input.signal,
      headers: {
        // The key travels in this header only; it is never put in the body,
        // the URL, or any diagnostic.
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    });
    if (!response.ok)
      return {
        unavailable: `http-${response.status}`,
      };
    return response.json();
  };
}
