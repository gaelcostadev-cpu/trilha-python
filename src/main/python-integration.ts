import type { App, IpcMain, IpcMainInvokeEvent } from 'electron';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerPythonIpc, type Launch } from './python-ipc';

export function installPythonIntegration(app: Pick<App, 'getAppPath'>, ipc: Pick<IpcMain, 'handle'>, trusted: (event: IpcMainInvokeEvent) => void, teacher: { status(): Promise<{ connected: boolean; planEnabled: boolean }> }) {
  const root = path.join(app.getAppPath(), 'experiments', 'python-isolation', 'safe-launcher');
  const launcherUrl = pathToFileURL(path.join(root, 'launcher.mjs')).href;
  return registerPythonIpc(ipc, trusted, {
    backendAvailable: async () => {
      if (process.platform !== 'win32' || !process.versions.electron) return false;
      await Promise.all(['launcher.mjs', 'lock-runtime.mjs', 'supervisor_launcher.py', 'runner_launcher.py', 'helper_launcher.mjs', 'runtime-manifest.json', 'official-runtime/python.exe', 'gate/bootstrap.py'].map(file => access(path.join(root, file))));
      return true;
    },
    authorize: async () => {
      const status = await teacher.status();
      return status.connected && status.planEnabled;
    },
    launch: async (getRequest, options) => {
      const module = await import(launcherUrl) as { launch: Launch };
      return module.launch(getRequest, options);
    },
  });
}
