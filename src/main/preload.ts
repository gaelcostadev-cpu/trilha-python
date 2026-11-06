import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('school', {
  openUsage: () => ipcRenderer.invoke('school:open-usage'),
  getState: () => ipcRenderer.invoke('school:state'),
  signIn: () => ipcRenderer.invoke('school:sign-in'),
  signOut: () => ipcRenderer.invoke('school:sign-out'),
  resumeTeacher: () => ipcRenderer.invoke('school:resume-teacher'),
  dismissTeacherWelcome: () => ipcRenderer.invoke('school:dismiss-teacher-welcome'),
  setPersonality: (value: string) => ipcRenderer.invoke('school:personality', value),
  saveCode: (id: string, code: string) => ipcRenderer.invoke('school:save-code', id, code),
  setCalendar: (date: string, status: string) => ipcRenderer.invoke('school:calendar', date, status),
  sendMessage: (scope: string, text: string, lessonId?: string) => ipcRenderer.invoke('school:message', scope, text, lessonId),
});
