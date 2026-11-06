import { safeStorage } from 'electron';
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
type Credential = { clientId: string; subject: string; name?: string; email?: string; idToken?: string; accessToken?: string; refreshToken?: string; expiresAt?: number; scopes: string[] };
type RecordData = { hostId: string; credential?: Credential; usagePaused?: boolean };
type Tokens = { access_token?: unknown; refresh_token?: unknown; id_token?: unknown; expires_in?: unknown; scope?: unknown; token_type?: unknown };
type Status = { connected: boolean; planEnabled: boolean; usagePaused: boolean; name?: string; email?: string };

async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(30000) });
  if (response.status === 429) {
    const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'subscription_sharing_usage_limit_exceeded') throw new Error('subscription_sharing_usage_limit_exceeded');
  }
  if (!response.ok) throw new Error(`OpenAI retornou erro HTTP ${response.status}. Verifique sua conexão, permissão e limites do plano.`);
  return response;
}
async function token(form: URLSearchParams): Promise<Tokens> {
  return (await request(`${issuer}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })).json() as Promise<Tokens>;
}
async function validateIdToken(idToken: string, clientId: string, nonce: string) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Identidade OpenAI inválida.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string };
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { iss?: string; aud?: string | string[]; azp?: string; exp?: number; nonce?: string; sub?: string; name?: string; email?: string };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Assinatura da identidade não suportada.');
  const jwks = await (await request(`${issuer}/.well-known/jwks.json`)).json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
  const key = jwks.keys?.find(item => item.kid === header.kid && item.kty === 'RSA' && (!item.alg || item.alg === 'RS256') && (!item.use || item.use === 'sig'));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url')) ||
      claims.iss !== issuer || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId) ||
      typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Não foi possível validar a identidade OpenAI.');
  }
  return claims;
}
function parseTokens(tokens: Tokens, old?: Credential) {
  if (!old && tokens.access_token === undefined && typeof tokens.scope === 'string' && !tokens.scope.split(/\s+/).includes('chatgpt.tokens.use.direct')) {
    return { accessToken: undefined, refreshToken: undefined, expiresAt: undefined, scopes: tokens.scope.split(/\s+/).filter(Boolean) };
  }
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.expires_in !== 'number' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 ||
      typeof tokens.token_type !== 'string' || tokens.token_type.toLowerCase() !== 'bearer' ||
      (tokens.refresh_token !== undefined && (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token)) ||
      (tokens.scope !== undefined && typeof tokens.scope !== 'string')) throw new Error('Resposta de autenticação inválida.');
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token as string | undefined ?? old?.refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000, scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : old?.scopes ?? [] };
}

export function createChatGPTService({ dataDir, openExternal }: { dataDir: string; openExternal: (url: string) => Promise<void> }) {
  const file = path.join(dataDir, 'chatgpt-session.bin');
  let refresh: Promise<Credential> | undefined;
  let signingIn = false;
  let generation = 0;
  let pendingAbort: AbortController | undefined;
  const activeRequests = new Set<AbortController>();
  function load(): RecordData {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento protegido do Windows não está disponível.');
    if (!existsSync(file)) return { hostId: `urn:uuid:${randomUUID()}` };
    try {
      const saved = JSON.parse(safeStorage.decryptString(readFileSync(file))) as RecordData;
      if (typeof saved.hostId !== 'string' || !saved.hostId) throw new Error();
      return saved;
    } catch { throw new Error('Não foi possível abrir a conexão protegida.'); }
  }
  function save(data: RecordData) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento protegido do Windows não está disponível.');
    const tmp = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 }); renameSync(tmp, file); }
    finally { if (existsSync(tmp)) unlinkSync(tmp); }
  }
  async function current(): Promise<Credential> {
    if (signingIn) throw new Error('A conexão com ChatGPT está em andamento.');
    const data = load();
    const credential = data.credential;
    if (!credential?.accessToken || !credential.scopes.includes('chatgpt.tokens.use.direct')) throw new Error('Conecte uma conta e permita o uso do plano ChatGPT.');
    if ((credential.expiresAt ?? 0) > Date.now() + 60000) return credential;
    if (!credential.refreshToken) throw new Error('Sessão expirada. Entre novamente com ChatGPT.');
    if (!refresh) {
      const started = generation;
      refresh = (async () => {
        const result = await token(new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId, refresh_token: credential.refreshToken!, resource }));
        const updated = { ...credential, ...parseTokens(result, credential) };
        if (generation !== started) throw new Error('A conexão foi encerrada.');
        data.credential = updated; save(data); return updated;
      })().finally(() => { refresh = undefined; });
    }
    return refresh;
  }
  async function models(credential: Credential) {
    const response = await request(`${resource}/models`, { headers: { Authorization: `Bearer ${credential.accessToken}` } });
    const data = await response.json() as { models?: Array<{ slug?: unknown; visibility?: unknown }> };
    const model = data.models?.find(item => item.visibility === 'list' && typeof item.slug === 'string' && item.slug);
    if (!model || typeof model.slug !== 'string') throw new Error('Nenhum modelo disponível para esta conta.');
    return model.slug;
  }
  function localStatus(): Status {
    const data = load();
    return { connected: Boolean(data.credential?.idToken), planEnabled: false, usagePaused: Boolean(data.usagePaused) };
  }
  async function status(): Promise<Status> {
    const data = load();
    const credential = data.credential;
    if (!credential?.idToken) return { connected: false, planEnabled: false, usagePaused: Boolean(data.usagePaused) };
    const info = { connected: true, planEnabled: false, usagePaused: Boolean(data.usagePaused), name: credential.name, email: credential.email };
    if (!credential.accessToken || !credential.scopes.includes('chatgpt.tokens.use.direct')) return info;
    await models(await current());
    return { ...info, planEnabled: true };
  }
  async function signIn(): Promise<Status> {
    if (signingIn) throw new Error('Já existe uma conexão em andamento.');
    signingIn = true;
    let started = generation;
    let data: RecordData;
    try {
      if (refresh) await refresh.catch(() => {});
      if (generation !== started) throw new Error('A conexão foi encerrada.');
      started = ++generation;
      for (const controller of activeRequests) controller.abort();
      data = load();
      save(data);
    } catch (error) { signingIn = false; throw error; }
    const old = data.credential;
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    pendingAbort = controller;
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Não foi possível iniciar o retorno de autenticação.');
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      const callback = new Promise<URLSearchParams>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Tempo de conexão esgotado.')), 5 * 60 * 1000);
        controller.signal.addEventListener('abort', () => reject(new Error('Conexão cancelada.')), { once: true });
        server.on('request', (req, res) => {
          let url: URL;
          try { url = new URL(req.url ?? '/', redirect); }
          catch { res.writeHead(400).end('Solicitação inválida.'); return; }
          if (req.method !== 'GET' || url.pathname !== '/auth/callback' || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state) { res.writeHead(400).end('Solicitação inválida.'); return; }
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end('Pode voltar ao aplicativo.');
          resolve(url.searchParams);
        });
      });
      const params = new URLSearchParams({ client_id: old?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: data.hostId, response_type: 'code', redirect_uri: redirect, scope: scopes, resource, state, nonce, code_challenge_method: 'S256', code_challenge: challenge });
      if (!old) params.set('agent_name_hint', 'Trilha Python');
      if (old?.idToken) params.set('id_token_hint', old.idToken);
      if (old?.email) params.set('login_hint', old.email);
      try { await openExternal(`${issuer}/api/accounts/authorize?${params}`); } catch { controller.abort(); await callback.catch(() => {}); throw new Error('Não foi possível abrir o navegador.'); }
      const result = await callback;
      if (result.has('error')) throw new Error('Autorização cancelada ou recusada no ChatGPT.');
      if (result.getAll('code').length !== 1 || result.getAll('client_id').length > 1) throw new Error('Retorno de autenticação inválido.');
      const code = result.get('code');
      const issued = result.get('client_id') ?? old?.clientId;
      if (!code || !issued || issued === 'dynamic_agent_client' || (old && issued !== old.clientId)) throw new Error('Registro de autenticação incompleto.');
      const tokens = await token(new URLSearchParams({ grant_type: 'authorization_code', client_id: issued, code, code_verifier: verifier, redirect_uri: redirect, resource }));
      if (typeof tokens.id_token !== 'string') throw new Error('A OpenAI não retornou identidade verificável.');
      const claims = await validateIdToken(tokens.id_token, issued, nonce);
      if (old && old.subject !== claims.sub) throw new Error('A conta selecionada não corresponde à conexão anterior.');
      const credential: Credential = { clientId: issued, subject: claims.sub!, name: typeof claims.name === 'string' ? claims.name : undefined, email: typeof claims.email === 'string' ? claims.email : undefined, idToken: tokens.id_token, ...parseTokens(tokens) };
      if (generation !== started) throw new Error('A conexão foi encerrada.');
      data.credential = credential; save(data);
      if (credential.accessToken && credential.scopes.includes('chatgpt.tokens.use.direct')) await models(credential);
      return { connected: true, planEnabled: Boolean(credential.accessToken && credential.scopes.includes('chatgpt.tokens.use.direct')), usagePaused: Boolean(data.usagePaused), name: credential.name, email: credential.email };
    } finally { if (timer) clearTimeout(timer); server.close(); pendingAbort = undefined; signingIn = false; }
  }
  async function signOut(): Promise<void> {
    generation++;
    pendingAbort?.abort();
    for (const controller of activeRequests) controller.abort();
    const data = load();
    const credential = data.credential;
    if (!credential) return;
    data.credential = { clientId: credential.clientId, subject: credential.subject, name: credential.name, email: credential.email, scopes: [] };
    delete data.usagePaused;
    save(data);
    if (!credential.refreshToken) return;
    try {
      const config = await (await request(`${issuer}/.well-known/openid-configuration`)).json() as { revocation_endpoint?: unknown };
      if (typeof config.revocation_endpoint !== 'string' || new URL(config.revocation_endpoint).origin !== issuer) throw new Error();
      await request(config.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: credential.refreshToken, token_type_hint: 'refresh_token', client_id: credential.clientId }) });
    } catch { throw new Error('Desconexão local concluída, mas não foi possível confirmar a revogação. Desconecte o aplicativo nas configurações do ChatGPT.'); }
  }
  async function ask({ message, context }: { message: string; context?: string }): Promise<string> {
    if (typeof message !== 'string' || !message.trim() || message.length > 10000 || (context !== undefined && (typeof context !== 'string' || context.length > 20000))) throw new Error('Mensagem ou contexto inválido.');
    const limitMessage = 'O limite de uso foi atingido. As solicitações estão pausadas. Confira https://chatgpt.com/settings/usage e retome quando desejar.';
    if (load().usagePaused) throw new Error(limitMessage);
    const started = generation;
    const controller = new AbortController();
    activeRequests.add(controller);
    try {
    const credential = await current();
    const model = await models(credential);
    if (started !== generation) throw new Error('A conexão foi encerrada.');
    if (load().usagePaused) throw new Error(limitMessage);
    const response = await request(`${resource}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${credential.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions: 'Você é um professor paciente de programação Python. Explique de forma clara e incentive o estudante a raciocinar.', input: [{ role: 'user', content: context ? `Contexto da atividade:\n${context}\n\nPergunta do estudante:\n${message}` : message }], store: false, stream: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]) });
    if (!response.body) throw new Error('Resposta do professor indisponível.');
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '', text = '', completed = false;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (started !== generation) throw new Error('A conexão foi encerrada.');
        buffer = (buffer + chunk.value).replace(/\r\n/g, '\n');
        if (buffer.length > 1000000 || text.length > 1000000) throw new Error('Resposta longa demais.');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const event = JSON.parse(data) as { type?: string; delta?: unknown; response?: { error?: { code?: string } }; error?: { code?: string } };
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
          if (event.response?.error?.code === 'subscription_sharing_usage_limit_exceeded' || event.error?.code === 'subscription_sharing_usage_limit_exceeded') throw new Error('subscription_sharing_usage_limit_exceeded');
          if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Error('A resposta do professor falhou. Verifique o limite e a permissão do plano.');
          if (event.type === 'response.completed') completed = true;
        }
      }
    } finally { reader.releaseLock(); }
    if (!completed || !text.trim()) throw new Error('A resposta do professor foi interrompida. Tente novamente.');
    return text;
    } catch (error) {
      if (error instanceof Error && error.message === 'subscription_sharing_usage_limit_exceeded' && generation === started) {
        const data = load(); data.usagePaused = true; save(data);
        for (const active of activeRequests) active.abort();
        throw new Error(limitMessage);
      }
      throw error;
    } finally { activeRequests.delete(controller); }
  }
  function resumeRequests(): void {
    const data = load(); delete data.usagePaused; save(data);
  }
  return { localStatus, status, signIn, signOut, ask, resumeRequests };
}
