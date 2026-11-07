import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const unavailable = 'A validação de segurança do Python ainda não foi concluída para esta versão.';

export function registerPythonIpc(ipc: Pick<IpcMain, 'handle'>, trusted: (event: IpcMainInvokeEvent) => void): void {
  ipc.handle('school:runtime-status', event => {
    trusted(event);
    return { available: false, reason: unavailable };
  });
  ipc.handle('school:run-python', (event, code: unknown, input: unknown) => {
    trusted(event);
    if (typeof code !== 'string' || !code.trim() || code.length > 100000 || typeof input !== 'string' || input.length > 50000) throw new Error('Código ou entrada inválidos.');
    throw new Error(unavailable);
  });
  ipc.handle('school:cancel-python', event => {
    trusted(event);
    return false;
  });
}
