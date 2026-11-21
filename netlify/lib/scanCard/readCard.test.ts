import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { classifyAnthropicError, makeClient, readCard } from './readCard';
import { SCAN_SCHEMA } from './prompt';

/** A client whose messages.create is a stub: no network, no key. */
function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const reply = (text: string, stop_reason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason,
  usage: { input_tokens: 1200, output_tokens: 300 },
});

const apiError = (status: number, error: Record<string, unknown>) =>
  Anthropic.APIError.generate(status, { type: 'error', error }, undefined, new Headers());

describe('readCard', () => {
  it('sends the image first, then the text, with the schema and no SDK retries', async () => {
    const { client, create } = fakeClient(reply('{"found":false,"course_name":null,"notes":"","row_sets":[]}'));
    const r = await readCard(client, 'haiku', 'AAAA', 20_000);
    expect(r).toEqual({
      raw: { found: false, course_name: null, notes: '', row_sets: [] },
      stopReason: 'end_turn',
      inputTokens: 1200,
      outputTokens: 300,
    });
    const [body, opts] = create.mock.calls[0];
    expect(opts).toEqual({ timeout: 20_000, maxRetries: 0 });
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(2000);
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: SCAN_SCHEMA } });
    const content = body.messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(content[1].type).toBe('text');
  });

  it('leaves Sonnet thinking adaptive at medium effort', async () => {
    const { client, create } = fakeClient(reply('{}'));
    await readCard(client, 'sonnet', 'AAAA', 25_000);
    const [body] = create.mock.calls[0];
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.thinking).toBeUndefined();
    expect(body.max_tokens).toBe(4000);
    expect(body.output_config.effort).toBe('medium');
  });

  it('reads the first text block after any thinking blocks', async () => {
    const { client } = fakeClient({
      content: [
        { type: 'thinking', thinking: '', signature: 'x' },
        { type: 'text', text: '{"found":true}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect((await readCard(client, 'sonnet', 'A', 1)).raw).toEqual({ found: true });
  });

  it('returns undefined rather than throwing on a reply that is not JSON', async () => {
    const { client } = fakeClient(reply('{"found": tru', 'max_tokens'));
    const r = await readCard(client, 'haiku', 'A', 1);
    expect(r.raw).toBeUndefined();
    expect(r.stopReason).toBe('max_tokens');
  });

  it('builds a client with an explicit key and base URL, ignoring the environment', () => {
    const before = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.invalid';
    try {
      const c = makeClient('test-key-not-real');
      expect(c.baseURL).toBe('https://api.anthropic.com');
      expect(c.apiKey).toBe('test-key-not-real');
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = before;
    }
  });
});

describe('classifyAnthropicError', () => {
  it.each([
    ['a timeout', new Anthropic.APIConnectionTimeoutError(), 'upstream'],
    ['a dropped connection', new Anthropic.APIConnectionError({ message: 'x' }), 'upstream'],
    ['a 500', apiError(500, { type: 'api_error', message: 'x' }), 'upstream'],
    ['a 529', apiError(529, { type: 'overloaded_error', message: 'x' }), 'upstream'],
    ['a true 429', apiError(429, { type: 'rate_limit_error', message: 'x' }), 'upstream'],
    [
      'a spend-cap 429',
      apiError(429, {
        type: 'rate_limit_error',
        message: 'x',
        details: { error_code: 'enforced_spend_limit_reached' },
      }),
      'paused',
    ],
    [
      'the workspace usage-limit 400',
      apiError(400, {
        type: 'invalid_request_error',
        message:
          'You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.',
      }),
      'paused',
    ],
    [
      'the organisation usage-limit 400',
      apiError(400, {
        type: 'invalid_request_error',
        message: 'You have reached your specified API usage limits. You will regain access on 2026-12-01.',
      }),
      'paused',
    ],
    ['a 402', apiError(402, { type: 'billing_error', message: 'x' }), 'paused'],
    ['a 401', apiError(401, { type: 'authentication_error', message: 'x' }), 'unavailable'],
    ['a 403', apiError(403, { type: 'permission_error', message: 'x' }), 'unavailable'],
    ['a 404', apiError(404, { type: 'not_found_error', message: 'x' }), 'unavailable'],
    [
      'any other 400',
      apiError(400, { type: 'invalid_request_error', message: 'image: something about usage limits' }),
      'internal',
    ],
    ['something that is not an SDK error', new Error('boom'), 'internal'],
  ])('maps %s', (_, err, expected) => {
    expect(classifyAnthropicError(err)).toBe(expected);
  });
});
