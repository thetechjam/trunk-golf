import { createHash } from 'node:crypto';
import type { Config } from '@netlify/functions';

// TEMPORARY — removed in the next commit of this PR. Measures the platform
// limits the scan function depends on (synchronous timeout, request body cap,
// runtime version) on the deploy preview. Answers only to a token whose hash
// is below, so the permalink deploy it lives on is not an open sleep endpoint.
const TOKEN_SHA256 = '0616e5982e4ff4289ad375df91e4a55ba78d8dccbd6ec74f70e635ebd09fa34f';

export default async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  if (createHash('sha256').update(token).digest('hex') !== TOKEN_SHA256) return new Response('no', { status: 404 });
  const sleep = Math.min(Number(url.searchParams.get('sleep') ?? 0) || 0, 70);
  const started = Date.now();
  let bytes = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
  }
  await new Promise((r) => setTimeout(r, sleep * 1000));
  return Response.json({ bytes, slept: sleep, ms: Date.now() - started, node: process.version });
};

export const config: Config = { path: '/api/platform-probe' };
