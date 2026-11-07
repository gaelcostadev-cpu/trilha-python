import type { IpcMain, IpcMainInvokeEvent } from 'electron';

type Result = { reason: 'completed' | 'cancelled' | 'timeout' | 'output_limit'; exitCode?: number; stdout: string; stderr: string };
export type Launch = (getRequest: () => Promise<{ code: string; input: string }>, options: { signal: AbortSignal }) => Promise<Result>;
type Dependencies = {
  launch?: Launch;
  backendAvailable?: () => Promise<boolean>;
  authorize: () => Promise<boolean>;
};
const unavailable = 'A validação de segurança do Python ainda não foi concluída para esta versão.';

export function registerPythonIpc(ipc: Pick<IpcMain, 'handle'>, trusted: (event: IpcMainInvokeEvent) => void, deps: Dependencies = { authorize: async () => false }) {
  let active: AbortController | undefined;
  let settled: Promise<void> | undefined;
  let stopped = false;
  async function available() {
    if (stopped || !deps.launch || !deps.backendAvailable) return false;
    try { return await deps.backendAvailable() && !stopped && await deps.authorize() && !stopped; } catch { return false; }
  }
  ipc.handle('school:runtime-status', async event => {
    trusted(event);
    return await available() ? { available: true, reason: 'O isolamento será verificado ao iniciar.' } : { available: false, reason: unavailable };
  });
  ipc.handle('school:run-python', async (event, code: unknown, input: unknown) => {
    trusted(event);
    if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 100000 || typeof input !== 'string' || Buffer.byteLength(input) > 50000) throw new Error('Código ou entrada inválidos.');
    if (stopped || active) throw new Error('Execução indisponível ou em andamento.');
    const controller = new AbortController();
    active = controller;
    let resolveSettled!: () => void;
    settled = new Promise<void>(resolve => { resolveSettled = resolve; });
    try {
      if (!await available() || controller.signal.aborted || !deps.launch) throw new Error(unavailable);
      let result: Result;
      try {
        result = await deps.launch(async () => {
          if (controller.signal.aborted || !await available() || controller.signal.aborted) throw new Error(unavailable);
          return { code, input };
        }, { signal: controller.signal });
      } catch (error) {
        stopped = true;
        throw error;
      }
      if (!result || !['completed', 'cancelled', 'timeout', 'output_limit'].includes(result.reason) || typeof result.stdout !== 'string' || typeof result.stderr !== 'string' || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 65536 || (result.exitCode !== undefined && !Number.isInteger(result.exitCode))) { stopped = true; throw new Error('Resposta do executor inválida.'); }
      return { reason: result.reason, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    } finally { if (active === controller) { active = undefined; settled = undefined; } resolveSettled(); }
  });
  ipc.handle('school:cancel-python', event => {
    trusted(event);
    if (!active || active.signal.aborted) return false;
    active.abort();
    return true;
  });
  return async () => { stopped = true; active?.abort(); await settled; };
}
