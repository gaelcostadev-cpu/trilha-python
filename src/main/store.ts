import initSqlJs, { Database } from 'sql.js';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export class Store {
  private constructor(private readonly db: Database, private readonly path: string) {}
  static async open(path: string): Promise<Store> {
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
    const db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database();
    db.run('CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, code TEXT NOT NULL); CREATE TABLE IF NOT EXISTS calendar (date TEXT PRIMARY KEY, status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, lesson_id TEXT, author TEXT NOT NULL, text TEXT NOT NULL)');
    return new Store(db, path);
  }
  private save() {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, Buffer.from(this.db.export()));
    renameSync(tmp, this.path);
  }
  drafts(): Record<string, string> {
    return Object.fromEntries(this.db.exec('SELECT id, code FROM drafts')[0]?.values ?? []) as Record<string, string>;
  }
  calendar(): { date: string; status: string }[] {
    return (this.db.exec('SELECT date, status FROM calendar ORDER BY date')[0]?.values ?? []).map(([date, status]) => ({ date: String(date), status: String(status) }));
  }
  personality(): string {
    return String(this.db.exec("SELECT value FROM settings WHERE key = 'personality'")[0]?.values[0]?.[0] ?? 'acolhedor');
  }
  needsTeacherWelcome(): boolean {
    return !this.db.exec("SELECT value FROM settings WHERE key = 'teacher_welcome_seen'")[0]?.values.length;
  }
  dismissTeacherWelcome() {
    this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('teacher_welcome_seen', 'yes')");
    this.save();
  }
  setPersonality(value: string) {
    this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('personality', ?)", [value]);
    this.save();
  }
  messages(): { id: string; scope: string; lessonId?: string; author: string; text: string }[] {
    return (this.db.exec('SELECT id, scope, lesson_id, author, text FROM messages ORDER BY id')[0]?.values ?? []).map(([id, scope, lessonId, author, text]) => ({ id: String(id), scope: String(scope), ...(lessonId ? { lessonId: String(lessonId) } : {}), author: String(author), text: String(text) }));
  }
  addExchange(scope: string, lessonId: string | null, question: string, answer: string) {
    this.db.run('BEGIN');
    try {
      this.db.run('INSERT INTO messages (scope, lesson_id, author, text) VALUES (?, ?, ?, ?)', [scope, lessonId, 'Você', question]);
      this.db.run('INSERT INTO messages (scope, lesson_id, author, text) VALUES (?, ?, ?, ?)', [scope, lessonId, 'Professor', answer]);
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
    this.save();
  }
  saveCode(id: string, code: string) {
    this.db.run('INSERT OR REPLACE INTO drafts (id, code) VALUES (?, ?)', [id, code]);
    this.save();
  }
  setCalendar(date: string, status: string) {
    if (status === 'none') this.db.run('DELETE FROM calendar WHERE date = ?', [date]);
    else this.db.run('INSERT OR REPLACE INTO calendar (date, status) VALUES (?, ?)', [date, status]);
    this.save();
  }
  close() { this.db.close(); }
}
