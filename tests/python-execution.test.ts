import { describe, expect, it, vi } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { registerPythonIpc } from '../src/main/python-ipc';

const allowed = {} as IpcMainInvokeEvent;
function setup(deps: Parameters<typeof registerPythonIpc>[2]) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => any>();
  const ipc = { handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => handlers.set(channel, handler) } as unknown as Pick<IpcMain, 'handle'>;
  const shutdown = registerPythonIpc(ipc, event => { if (event !== allowed) throw Error('Origem inválida.'); }, deps);
  return { call: (name: string, ...args: unknown[]) => handlers.get(`school:${name}`)!(allowed, ...args), handlers, shutdown };
}
const result = { reason: 'completed' as const, exitCode: 0, stdout: 'ok', stderr: '' };
describe('adaptador Python', () => {
  it('falha fechado sem backend verificado e valida origem e dados', async () => {
    const launch = vi.fn(async () => result);
    const { call, handlers } = setup({ authorize: async () => true, launch });
    expect(await call('runtime-status')).toMatchObject({ available: false });
    await expect(call('run-python', 'print(1)', '')).rejects.toThrow('validação de segurança');
    await expect(call('run-python', 'x'.repeat(100001), '')).rejects.toThrow('inválidos');
    await expect(handlers.get('school:run-python')!({} as IpcMainInvokeEvent, 'x', '')).rejects.toThrow('Origem inválida');
    expect(launch).not.toHaveBeenCalled();
  });
  it('serializa execução, cancela e aborta ao encerrar', async () => {
    let finish!: (value: typeof result) => void;
    let signal!: AbortSignal;
    const launch = vi.fn((_request: () => Promise<{ code: string; input: string }>, options: { signal: AbortSignal }) => { signal = options.signal; return new Promise<typeof result>(resolve => { finish = resolve; }); });
    const { call, shutdown } = setup({ authorize: async () => true, backendAvailable: async () => true, launch });
    const running = call('run-python', 'print(1)', '');
    await expect(call('run-python', 'print(2)', '')).rejects.toThrow('andamento');
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(call('cancel-python')).toBe(true);
    expect(call('cancel-python')).toBe(false);
    expect(signal.aborted).toBe(true);
    finish(result); await running;
    const next = call('run-python', 'print(3)', '');
    await vi.waitFor(() => expect(vi.mocked(launch)).toHaveBeenCalledTimes(2));
    const closing = shutdown(); expect(signal.aborted).toBe(true); finish(result); await next; await closing;
    expect(await call('runtime-status')).toMatchObject({ available: false });
  });
  it('não entrega código após perda de autorização ou cancelamento', async () => {
    let authorized = true;
    let request!: () => Promise<{ code: string; input: string }>;
    let finish!: (value: typeof result) => void;
    const launch = vi.fn((getRequest: () => Promise<{ code: string; input: string }>) => { request = getRequest; return new Promise<typeof result>(resolve => { finish = resolve; }); });
    const { call } = setup({ authorize: async () => authorized, backendAvailable: async () => true, launch });
    const running = call('run-python', 'segredo', 'entrada');
    await vi.waitFor(() => expect(request).toBeDefined());
    authorized = false; await expect(request()).rejects.toThrow('validação de segurança');
    authorized = true; call('cancel-python'); await expect(request()).rejects.toThrow('validação de segurança');
    finish(result); await running;
  });
  it('não inicia se encerrar durante a verificação', async () => {
    let release!: (value: boolean) => void;
    const launch = vi.fn(async () => result);
    const { call, shutdown } = setup({ authorize: () => new Promise<boolean>(resolve => { release = resolve; }), backendAvailable: async () => true, launch });
    const running = call('run-python', 'print(1)', '');
    await vi.waitFor(() => expect(release).toBeDefined());
    const closing = shutdown();
    release(true);
    await expect(running).rejects.toThrow('validação de segurança');
    await closing;
    expect(launch).not.toHaveBeenCalled();
  });
  it('bloqueia novas tentativas após falha do executor sem prova de limpeza', async () => {
    const launch = vi.fn(async () => { throw Error('falha'); });
    const { call } = setup({ authorize: async () => true, backendAvailable: async () => true, launch });
    await expect(call('run-python', 'print(1)', '')).rejects.toThrow('falha');
    expect(await call('runtime-status')).toMatchObject({ available: false });
    await expect(call('run-python', 'print(2)', '')).rejects.toThrow('indisponível');
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it('cancela durante inicialização sem entregar código e bloqueia repetição após rejeição', async () => {
    let called = false;
    const launch = vi.fn((request: () => Promise<{ code: string; input: string }>, { signal }: { signal: AbortSignal }) => new Promise<typeof result>((_resolve, reject) => {
      called = true;
      signal.addEventListener('abort', () => { void request().then(() => reject(Error('código entregue')), () => reject(Error('inicialização cancelada'))); }, { once: true });
    }));
    const { call } = setup({ authorize: async () => true, backendAvailable: async () => true, launch });
    const running = call('run-python', 'print(1)', '');
    await vi.waitFor(() => expect(called).toBe(true));
    expect(call('cancel-python')).toBe(true);
    await expect(running).rejects.toThrow('inicialização cancelada');
    await expect(call('run-python', 'print(2)', '')).rejects.toThrow('indisponível');
    expect(launch).toHaveBeenCalledTimes(1);
  });
});
