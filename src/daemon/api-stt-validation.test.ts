import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiRoutes, type ApiContext } from './api-routes.ts';
import { initDatabase, closeDb } from '../vault/schema.ts';
import { loadUserSection } from './user-settings.ts';
import type { MogoiConfig } from '../config/types.ts';

type Handler = (req: Request) => Response | Promise<Response>;

function post(config: MogoiConfig, body: Record<string, unknown>): Response | Promise<Response> {
  const ctx = {
    daemonStartedAt: Date.now(),
    healthMonitor: {} as ApiContext['healthMonitor'],
    config,
  } as ApiContext;
  const route = createApiRoutes(ctx)['/api/config/stt'] as { POST: Handler };
  return route.POST(new Request('http://x/api/config/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

const selfHosted = (): MogoiConfig => ({ stt: { provider: 'openai' } } as MogoiConfig);
const hosted = (): MogoiConfig => ({
  stt: { provider: 'openai' },
  motius_ai: { base_url: 'https://llm.motius.host', api_key: 'sk-uj-not-real' },
} as MogoiConfig);

describe('POST /api/config/stt validation', () => {
  // NEVER touch the real keychain at ~/.mogoi: point the secrets store at a
  // throwaway dir for every test in this file.
  let secretsDir: string;
  let prevSecretsDir: string | undefined;

  beforeEach(() => {
    prevSecretsDir = process.env.MOGOI_SECRETS_DIR;
    secretsDir = mkdtempSync(join(tmpdir(), 'mogoi-stt-test-'));
    process.env.MOGOI_SECRETS_DIR = secretsDir;
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDb();
    rmSync(secretsDir, { recursive: true, force: true });
    if (prevSecretsDir === undefined) delete process.env.MOGOI_SECRETS_DIR;
    else process.env.MOGOI_SECRETS_DIR = prevSecretsDir;
  });

  it('rejects an unknown provider with a 400, not ok:true', async () => {
    const res = await post(selfHosted(), { provider: 'whispersync' });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('rejects motius on a self-hosted install where it can never bind', async () => {
    const res = await post(selfHosted(), { provider: 'motius' });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain('hosted');
  });

  it('accepts motius on a hosted install', async () => {
    const res = await post(hosted(), { provider: 'motius' });
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('strips a motius credential sub-block before anything persists', async () => {
    // The hosted key must never land in the plaintext cfg.stt row — that is
    // the exact leak the credential split exists to prevent.
    const res = await post(hosted(), {
      provider: 'motius',
      motius: { api_key: 'sk-uj-should-never-persist' },
    });
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    const row = JSON.stringify(loadUserSection('stt') ?? {});
    expect(row).not.toContain('sk-uj-should-never-persist');
    expect(row).not.toContain('motius_ai');
  });
});
