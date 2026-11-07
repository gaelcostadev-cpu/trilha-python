import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { skills } from '../domain';
import { createChatGPTService } from './chatgpt';
import { Store } from './store';
import { registerPythonIpc } from './python-ipc';
import { teacherContext, type Personality } from './teacher';

let store: Store;
let window: BrowserWindow;
let teacher: ReturnType<typeof createChatGPTService>;
let account = { connected: false, planEnabled: false, usagePaused: false };
let checking: Promise<void>;
let sending = false;
const personalities: Personality[] = ['acolhedor', 'direto', 'socratico'];
const challengeIds = new Set(skills.flatMap(skill => [...skill.activities, skill.exam].map(item => item.id)));
function personality(): Personality {
  const value = store.personality() as Personality;
  return personalities.includes(value) ? value : 'acolhedor';
}
function state() {
  const drafts = store.drafts();
  return {
    profile: { name: 'Estudante', level: 1, xp: 0 },
    lessons: skills.map((skill, index) => ({ id: skill.id, title: skill.title, description: skill.description, status: index ? 'locked' : 'available', prerequisites: skill.prerequisite ? [skill.prerequisite] : [], code: drafts[skill.activities[0].id] ?? skill.activities[0].starter, hints: skill.activities[0].hints, prompt: skill.activities[0].prompt, activityId: skill.activities[0].id })),
    equipment: [], calendar: store.calendar(), messages: store.messages(),
    teacher: { authenticated: account.connected, personality: personality(), usagePaused: account.usagePaused, showWelcome: account.planEnabled && store.needsTeacherWelcome() },
    onlineValidated: account.planEnabled, executionAvailable: false,
  };
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem inválida.');
}
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else {
app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});
app.whenReady().then(async () => {
  store = await Store.open(path.join(app.getPath('userData'), 'constelacao.sqlite'));
  teacher = createChatGPTService({ dataDir: app.getPath('userData'), openExternal: url => shell.openExternal(url) });
  try { account = teacher.localStatus(); } catch { account = { connected: false, planEnabled: false, usagePaused: false }; }
  checking = teacher.status().then(status => { account = status; }).catch(() => { account = { ...account, planEnabled: false }; });
  registerPythonIpc(ipcMain, trusted);
  ipcMain.handle('school:open-usage', event => { trusted(event); return shell.openExternal('https://chatgpt.com/settings/usage'); });
  ipcMain.handle('school:state', async event => { trusted(event); await checking; return state(); });
  ipcMain.handle('school:sign-in', async event => {
    trusted(event); await checking;
    try { account = await teacher.signIn(); }
    catch (error) { try { account = teacher.localStatus(); } catch { account = { connected: false, planEnabled: false, usagePaused: false }; } throw error; }
    if (!account.planEnabled) throw new Error('A conta não autorizou o uso do plano ChatGPT.');
    return state();
  });
  ipcMain.handle('school:sign-out', async event => {
    trusted(event); await checking;
    try { await teacher.signOut(); } finally { account = { connected: false, planEnabled: false, usagePaused: false }; }
    return state();
  });
  ipcMain.handle('school:resume-teacher', event => {
    trusted(event);
    if (!account.connected) throw new Error('Conecte uma conta ChatGPT antes de retomar.');
    teacher.resumeRequests(); account = { ...account, usagePaused: false }; return state();
  });
  ipcMain.handle('school:dismiss-teacher-welcome', event => { trusted(event); store.dismissTeacherWelcome(); return state(); });
  ipcMain.handle('school:personality', (event, value: unknown) => {
    trusted(event);
    if (typeof value !== 'string' || !personalities.includes(value as Personality)) throw new Error('Estilo de professor inválido.');
    store.setPersonality(value); return state();
  });
  ipcMain.handle('school:save-code', (event, id: unknown, code: unknown) => {
    trusted(event);
    if (typeof id !== 'string' || !challengeIds.has(id) || typeof code !== 'string' || code.length > 100000) throw new Error('Rascunho inválido.');
    store.saveCode(id, code); return state();
  });
  ipcMain.handle('school:calendar', (event, date: unknown, status: unknown) => {
    trusted(event);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof status !== 'string' || !['planned', 'done', 'rest', 'none'].includes(status)) throw new Error('Data ou estado inválido.');
    store.setCalendar(date, status); return state();
  });
  ipcMain.handle('school:message', async (event, scope: unknown, text: unknown, lessonId: unknown) => {
    trusted(event); await checking;
    if (!account.connected || !account.planEnabled) throw new Error('Conecte uma conta ChatGPT compatível para conversar.');
    if ((scope !== 'general' && scope !== 'lesson') || typeof text !== 'string' || !text.trim() || text.length > 10000 || (scope === 'lesson' && (typeof lessonId !== 'string' || !skills.some(skill => skill.id === lessonId)))) throw new Error('Mensagem ou contexto inválido.');
    if (sending) throw new Error('Aguarde a resposta em andamento.');
    sending = true;
    try {
      const id = scope === 'lesson' ? lessonId as string : undefined;
      const answer = await teacher.ask({ message: text.trim(), context: teacherContext(scope, id, personality(), store.messages()) });
      store.addExchange(scope, id ?? null, text.trim(), answer);
      return state();
    } catch (error) {
      try { account = { ...account, usagePaused: teacher.localStatus().usagePaused }; } catch { /* Preserve o erro original. */ }
      throw error;
    } finally { sending = false; }
  });
  window = new BrowserWindow({ width: 1440, height: 950, minWidth: 900, minHeight: 650, backgroundColor: '#101319', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadFile(path.join(__dirname, '../../renderer/index.html'));
}).catch(error => { console.error('Falha ao iniciar o aplicativo:', error); app.quit(); });
}
app.on('window-all-closed', () => { store?.close(); app.quit(); });
