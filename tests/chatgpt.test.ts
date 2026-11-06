import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const fake = vi.hoisted(() => ({ server: null as any }));
vi.mock('node:http', async () => {
  const { EventEmitter } = await import('node:events');
  return { createServer: () => {
    const server = new EventEmitter() as any;
    server.listen = (_port: number, _host: string, done: () => void) => done();
    server.address = () => ({ port: 12345 });
    server.close = () => {};
    fake.server = server;
    return server;
  } };
});
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') } }));
import { createChatGPTService } from '../src/main/chatgpt';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) { const file = path.join(dir, 'chatgpt-session.bin'); if (existsSync(file)) unlinkSync(file); rmdirSync(dir); } });

describe('ChatGPT', () => {
  it('valida identidade, protege credenciais e consome resposta até a conclusão', async () => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let nonce = '';
    let sent: Record<string, unknown> = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
        const body = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: 'oaiapp_test', exp: Date.now() / 1000 + 600, nonce, sub: 'subject' })).toString('base64url');
        const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
        return Response.json({ id_token: `${header}.${body}.${signature}`, access_token: 'private-access-token', refresh_token: 'private-refresh-token', token_type: 'Bearer', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' });
      }
      if (url.endsWith('/jwks.json')) return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' }] });
      if (url.endsWith('/models')) return Response.json({ models: [{ slug: 'test-model', visibility: 'list' }] });
      if (url.endsWith('/responses')) {
        sent = JSON.parse(String(init?.body));
        const chunks = ['data: {"type":"response.output_text.delta","delta":"Olá"}\r', '\n\r\ndata: {"type":"response.completed"}\n\n'];
        return new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
      }
      throw new Error('unexpected request');
    });
    const service = createChatGPTService({ dataDir: dir, openExternal: async (address) => {
      const authorization = new URL(address);
      nonce = authorization.searchParams.get('nonce')!;
      expect(authorization.searchParams.get('client_id')).toBe('dynamic_agent_client');
      const callback = new URL(authorization.searchParams.get('redirect_uri')!);
      let invalidStatus = 0;
      fake.server.emit('request', { method: 'GET', url: 'http://[' }, { writeHead: (status: number) => { invalidStatus = status; return { end: () => {} }; } });
      expect(invalidStatus).toBe(400);
      callback.searchParams.set('state', authorization.searchParams.get('state')!);
      callback.searchParams.set('client_id', 'oaiapp_test');
      callback.searchParams.set('code', 'code');
      fake.server.emit('request', { method: 'GET', url: callback.pathname + callback.search }, { writeHead: () => ({ end: () => {} }) });
    } });
    expect(await service.signIn()).toMatchObject({ connected: true, planEnabled: true });
    expect(readFileSync(path.join(dir, 'chatgpt-session.bin')).toString()).not.toContain('private-access-token');
    expect(await service.ask({ message: 'Ajuda', context: 'laços' })).toBe('Olá');
    expect(sent).toMatchObject({ model: 'test-model', stream: true, store: false });
    expect(JSON.stringify(sent)).not.toContain('private-access-token');
  });

  it('recusa resposta interrompida e autenticação sem permissão', async () => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const saved = { hostId: 'host', credential: { clientId: 'client', subject: 'sub', idToken: 'identity', accessToken: 'token', expiresAt: Date.now() + 3600000, scopes: [] } };
    const save = () => writeFileSync(path.join(dir, 'chatgpt-session.bin'), JSON.stringify(saved).split('').reverse().join(''));
    save();
    const service = createChatGPTService({ dataDir: dir, openExternal: async () => {} });
    expect(service.localStatus()).toEqual({ connected: true, planEnabled: false, usagePaused: false });
    expect(await service.status()).toMatchObject({ connected: true, planEnabled: false });
    await expect(service.ask({ message: 'Oi' })).rejects.toThrow('permita');
    saved.credential.scopes = ['chatgpt.tokens.use.direct']; save();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).endsWith('/models') ? Response.json({ models: [{ slug: 'm', visibility: 'list' }] }) : new Response('data: {"type":"response.output_text.delta","delta":"parcial"}\n\n'));
    await expect(service.ask({ message: 'Oi' })).rejects.toThrow('interrompida');
  });

  it('preserva a sessão anterior quando a nova identidade é inválida', async () => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const file = path.join(dir, 'chatgpt-session.bin');
    const saved = { hostId: 'host', credential: { clientId: 'oaiapp_test', subject: 'sub', idToken: 'old-id', accessToken: 'old-token', scopes: ['chatgpt.tokens.use.direct'] } };
    writeFileSync(file, JSON.stringify(saved).split('').reverse().join(''));
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/jwks.json')) return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' }] });
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: 'oaiapp_test', exp: Date.now() / 1000 + 600, nonce: 'incorrect', sub: 'sub' })).toString('base64url');
      const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
      return Response.json({ id_token: `${header}.${body}.${signature}`, access_token: 'new', token_type: 'Bearer', expires_in: 3600, scope: 'chatgpt.tokens.use.direct' });
    });
    const service = createChatGPTService({ dataDir: dir, openExternal: async address => {
      const url = new URL(address);
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      callback.searchParams.set('code', 'code');
      fake.server.emit('request', { method: 'GET', url: callback.pathname + callback.search }, { writeHead: () => ({ end: () => {} }) });
    } });
    await expect(service.signIn()).rejects.toThrow('validar');
    expect(JSON.parse(readFileSync(file).toString().split('').reverse().join(''))).toEqual(saved);
  });

  it.each(['http', 'stream'])('pausa solicitações após limite de uso (%s)', async (kind) => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const saved = { hostId: 'host', credential: { clientId: 'client', subject: 'sub', idToken: 'identity', accessToken: 'token', expiresAt: Date.now() + 3600000, scopes: ['chatgpt.tokens.use.direct'] } };
    writeFileSync(path.join(dir, 'chatgpt-session.bin'), JSON.stringify(saved).split('').reverse().join(''));
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input).endsWith('/models')) return Response.json({ models: [{ slug: 'm', visibility: 'list' }] });
      calls++;
      const failure = { error: { code: 'subscription_sharing_usage_limit_exceeded' } };
      return kind === 'http' ? Response.json(failure, { status: 429 }) : new Response(`data: ${JSON.stringify({ type: 'response.failed', response: failure })}\n\n`);
    });
    const service = createChatGPTService({ dataDir: dir, openExternal: async () => {} });
    await expect(service.ask({ message: 'Oi' })).rejects.toThrow('chatgpt.com/settings/usage');
    expect(service.localStatus().usagePaused).toBe(true);
    expect((await service.status()).usagePaused).toBe(true);
    await expect(service.ask({ message: 'Oi' })).rejects.toThrow('pausadas');
    expect(calls).toBe(1);
    service.resumeRequests();
    expect(service.localStatus().usagePaused).toBe(false);
    await expect(service.ask({ message: 'Oi' })).rejects.toThrow('pausadas');
    expect(calls).toBe(2);
  });

  it.each(['models', 'refresh'])('mantém pausa após erro de limite em %s e recriação do serviço', async phase => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const saved = { hostId: 'host', credential: { clientId: 'client', subject: 'sub', idToken: 'identity', accessToken: 'token', refreshToken: 'refresh', expiresAt: phase === 'refresh' ? 0 : Date.now() + 3600000, scopes: ['chatgpt.tokens.use.direct'] } };
    writeFileSync(path.join(dir, 'chatgpt-session.bin'), JSON.stringify(saved).split('').reverse().join(''));
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, { status: 429 });
    });
    const options = { dataDir: dir, openExternal: async () => {} };
    await expect(createChatGPTService(options).ask({ message: 'Oi' })).rejects.toThrow('pausadas');
    const reopened = createChatGPTService(options);
    expect(reopened.localStatus().usagePaused).toBe(true);
    await expect(reopened.ask({ message: 'Oi' })).rejects.toThrow('pausadas');
    expect(calls).toBe(1);
  });

  it('aguarda a renovação antes de começar uma nova autorização', async () => {
    const dir = mkdtempSync(path.join(process.cwd(), 'siwc-')); dirs.push(dir);
    const file = path.join(dir, 'chatgpt-session.bin');
    const saved = { hostId: 'host', credential: { clientId: 'oaiapp_test', subject: 'sub', idToken: 'old-id', accessToken: 'old-token', refreshToken: 'old-refresh', expiresAt: 0, scopes: ['chatgpt.tokens.use.direct'] } };
    writeFileSync(file, JSON.stringify(saved).split('').reverse().join(''));
    let finishRefresh!: (response: Response) => void;
    const refreshing = new Promise<Response>(resolve => { finishRefresh = resolve; });
    let opened = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/oauth/token')) return refreshing;
      return Response.json({ models: [{ slug: 'm', visibility: 'list' }] });
    });
    const service = createChatGPTService({ dataDir: dir, openExternal: async () => { opened = true; throw new Error('cancel'); } });
    const status = service.status();
    const signIn = service.signIn();
    expect(opened).toBe(false);
    finishRefresh(Response.json({ access_token: 'refreshed', refresh_token: 'rotated', token_type: 'Bearer', expires_in: 3600 }));
    await status;
    await expect(signIn).rejects.toThrow('navegador');
    const persisted = JSON.parse(readFileSync(file).toString().split('').reverse().join(''));
    expect(persisted.credential.accessToken).toBe('refreshed');
    expect(persisted.credential.refreshToken).toBe('rotated');
  });
});





