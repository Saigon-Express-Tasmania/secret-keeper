/**
 * Netlify Function for the vault API (/api/vault/*). All logic lives in
 * server/; this file only adapts Netlify's runtime and declares routing plus
 * a free edge rate limit that rejects floods before the function runs.
 */

import type { Config, Context } from "@netlify/functions"

import { handleNetlifyRequest } from "../../server/netlify"

export default async function vault(request: Request, context: Context): Promise<Response> {
  return handleNetlifyRequest(request, (promise) => context.waitUntil(promise))
}

export const config: Config = {
  path: "/api/vault/*",
  method: ["GET", "POST", "PUT"],
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
}
