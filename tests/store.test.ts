import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/main/store';
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) {
    for (const name of ['school.db', 'school.db.tmp']) {
      const file = join(dir, name);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(dir);
  }
});
describe('SQLite', () => {
  it('restaura rascunho e calendário depois de fechar e reabrir', async () => {
    const dir = mkdtempSync(join(process.cwd(), 'trilha-test-')); directories.push(dir);
    const file = join(dir, 'school.db');
    let store = await Store.open(file);
    store.saveCode('ola', 'print("Olá")'); store.setCalendar('2026-11-06', 'planned'); store.close();
    store = await Store.open(file);
    expect(store.drafts()).toEqual({ ola: 'print("Olá")' });
    expect(store.calendar()).toEqual([{ date: '2026-11-06', status: 'planned' }]);
    store.setCalendar('2026-11-06', 'none'); store.close();
    store = await Store.open(file); expect(store.calendar()).toEqual([]); store.close();
  });
  it('preserva personalidade e conversas por contexto após reabrir', async () => {
    const dir = mkdtempSync(join(process.cwd(), 'trilha-test-')); directories.push(dir);
    const file = join(dir, 'school.db');
    let store = await Store.open(file);
    expect(store.needsTeacherWelcome()).toBe(true);
    store.dismissTeacherWelcome();
    store.setPersonality('socratico');
    store.addExchange('lesson', 'saida', 'Como usar print?', 'O que você deseja mostrar?');
    store.addExchange('general', null, 'Olá', 'Olá!');
    store.close();
    store = await Store.open(file);
    expect(store.needsTeacherWelcome()).toBe(false);
    expect(store.personality()).toBe('socratico');
    expect(store.messages().map(({ scope, lessonId, author, text }) => ({ scope, lessonId, author, text }))).toEqual([
      { scope: 'lesson', lessonId: 'saida', author: 'Você', text: 'Como usar print?' },
      { scope: 'lesson', lessonId: 'saida', author: 'Professor', text: 'O que você deseja mostrar?' },
      { scope: 'general', lessonId: undefined, author: 'Você', text: 'Olá' },
      { scope: 'general', lessonId: undefined, author: 'Professor', text: 'Olá!' },
    ]);
    store.close();
  });
});
