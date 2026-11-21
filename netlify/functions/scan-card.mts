import type { Config } from '@netlify/functions';
import { createScanHandler } from '../lib/scanCard/handler';
import { classifyAnthropicError, makeClient, readCard } from '../lib/scanCard/readCard';

// The only place the key is read. A dedicated name, not ANTHROPIC_API_KEY:
// Netlify's AI Gateway injects that one on some plans, which would switch the
// feature on with a key outside the capped workspace. Netlify hands functions
// their environment at deploy time, so adding the key means a redeploy.
export default (req: Request) =>
  createScanHandler({
    apiKey: process.env.TRUNK_SCAN_ANTHROPIC_KEY,
    makeRead: (key) => {
      const client = makeClient(key);
      return (model, b64, timeoutMs) => readCard(client, model, b64, timeoutMs);
    },
    classify: classifyAnthropicError,
  })(req);

// No `method` here on purpose: a request with a method the function does not
// claim falls through to the SPA's index.html and answers 200 HTML. The
// handler answers anything but POST with a 405 instead.
export const config: Config = {
  path: '/api/scan-card',
  rateLimit: { windowLimit: 6, windowSize: 180, aggregateBy: ['ip', 'domain'] },
};
