import Anthropic from '@anthropic-ai/sdk';
import { SCAN_SCHEMA, SYSTEM_PROMPT, USER_TEXT } from './prompt';

/**
 * The one file that talks to Anthropic. Everything else in the scan path takes
 * a `read` function, so the handler is tested without the SDK or a network.
 */

export type ModelChoice = 'haiku' | 'sonnet';

export interface ReadResult {
  /** The parsed JSON reply, or undefined when there was none to parse. */
  raw: unknown;
  /** Why the model stopped. Anything but end_turn is a failed attempt. */
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Per-model request settings.
 *
 * Haiku runs with thinking off: this is transcription, not reasoning, and the
 * first pass is meant to be quick and cheap. Sonnet 5.5 rejects
 * `{type: 'disabled'}` with a 400, so its thinking is left adaptive and held
 * to medium effort; the larger max_tokens leaves room for that thinking and an
 * eighteen-hole, six-row reply.
 */
const MODELS = {
  haiku: {
    model: 'claude-haiku-5-5',
    max_tokens: 2000,
    thinking: { type: 'disabled' },
  },
  sonnet: {
    model: 'claude-sonnet-5-5',
    max_tokens: 4000,
    output_config_effort: 'medium',
  },
} as const;

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({
    // Both explicit. With apiKey passed in code the SDK reads no credential
    // from the environment, and the base URL is pinned so an injected
    // ANTHROPIC_BASE_URL (Netlify's AI Gateway sets one on some plans) cannot
    // route this key, or its spend, anywhere but the workspace it belongs to.
    apiKey,
    baseURL: 'https://api.anthropic.com',
    // The SDK's own logger prints request failures, which carry the API's
    // error message. The handler logs one sanitised line per request instead.
    logLevel: 'off',
  });
}

export async function readCard(
  client: Anthropic,
  choice: ModelChoice,
  jpegBase64: string,
  timeoutMs: number
): Promise<ReadResult> {
  const m = MODELS[choice];
  const response = await client.messages.create(
    {
      model: m.model,
      max_tokens: m.max_tokens,
      ...('thinking' in m ? { thinking: m.thinking } : {}),
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: SCAN_SCHEMA as unknown as Record<string, unknown> },
        ...('output_config_effort' in m ? { effort: m.output_config_effort } : {}),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: USER_TEXT },
          ],
        },
      ],
    },
    // The handler owns retrying, across models and against the function's
    // deadline; the SDK's own retries would spend that deadline silently.
    { timeout: timeoutMs, maxRetries: 0 }
  );

  const text = response.content.find((b) => b.type === 'text');
  let raw: unknown;
  if (text && text.type === 'text') {
    try {
      raw = JSON.parse(text.text);
    } catch {
      raw = undefined;
    }
  }
  return {
    raw,
    stopReason: response.stop_reason ?? null,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

export type ScanFailure = 'upstream' | 'paused' | 'unavailable' | 'internal';

/**
 * Workspace and organisation spend caps come back as a 400 whose message
 * begins like this. There is no documented error code for it, so the prefix
 * is the contract; both wordings have been seen.
 */
const SPEND_LIMIT_PREFIXES = [
  'You have reached your specified workspace API usage limits',
  'You have reached your specified API usage limits',
];

/**
 * What an SDK error means for the person holding the phone.
 *
 * - upstream: worth trying again in a moment (5xx, 529 overloaded, a real 429,
 *   a timeout, a dropped connection).
 * - paused: the spend cap is doing its job. Trying again will not help until
 *   the month turns over or the cap is raised.
 * - unavailable: the key or model is wrong — a configuration problem only
 *   the maintainer can fix.
 * - internal: anything else.
 */
export function classifyAnthropicError(err: unknown): ScanFailure {
  // APIConnectionError (and its timeout subclass) extends APIError in the
  // TypeScript SDK, so it is checked first.
  if (err instanceof Anthropic.APIConnectionError) return 'upstream';
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const message = typeof err.apiMessage === 'string' ? err.apiMessage : '';
    if (status === 402 || err.type === 'billing_error') return 'paused';
    if (status === 400 && SPEND_LIMIT_PREFIXES.some((p) => message.startsWith(p))) return 'paused';
    if (status === 429) {
      return err.errorCode === 'enforced_spend_limit_reached' ? 'paused' : 'upstream';
    }
    if (status === 401 || status === 403 || status === 404) return 'unavailable';
    if (status === 408 || status === 409) return 'upstream';
    if (typeof status === 'number' && status >= 500) return 'upstream';
    return 'internal';
  }
  return 'internal';
}
