import { describe, expect, it } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { registerPythonIpc } from '../src/main/python-ipc';

describe('proteção da execução Python', () => {
  it('mantém a execução bloqueada mesmo por chamada direta à ponte', () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
    const ipc = { handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => { handlers.set(channel, handler); } } as unknown as Pick<IpcMain, 'handle'>;
    const allowed = {} as IpcMainInvokeEvent;
    registerPythonIpc(ipc, event => { if (event !== allowed) throw new Error('Origem inválida.'); });
    expect(handlers.get('school:runtime-status')!(allowed)).toMatchObject({ available: false });
    expect(() => handlers.get('school:run-python')!(allowed, 'print(1)', '')).toThrow('validação de segurança');
    expect(() => handlers.get('school:run-python')!({} as IpcMainInvokeEvent, 'print(1)', '')).toThrow('Origem inválida');
    expect(handlers.get('school:cancel-python')!(allowed)).toBe(false);
  });
});
