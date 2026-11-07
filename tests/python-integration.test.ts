import { describe, expect, it, vi } from 'vitest';
import type { App, IpcMain, IpcMainInvokeEvent } from 'electron';
import { installPythonIntegration } from '../src/main/python-integration';

describe('gate de integração', () => {
  it('mantém o launcher bloqueado se os recursos não estiverem disponíveis', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => any>();
    const ipc = { handle: (name: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => handlers.set(name, handler) } as unknown as Pick<IpcMain, 'handle'>;
    const status = vi.fn(async () => ({ connected: true, planEnabled: true }));
    const shutdown = installPythonIntegration({ getAppPath: () => 'C:/app' } as Pick<App, 'getAppPath'>, ipc, () => {}, { status });
    const event = {} as IpcMainInvokeEvent;
    expect(await handlers.get('school:runtime-status')!(event)).toMatchObject({ available: false });
    await expect(handlers.get('school:run-python')!(event, 'print(1)', '')).rejects.toThrow('validação de segurança');
    expect(status).not.toHaveBeenCalled();
    await shutdown();
  });
});
