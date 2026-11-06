export type LessonStatus = 'available' | 'locked' | 'completed';
export type TeacherPersonality = 'acolhedor' | 'direto' | 'socratico';
export type CalendarStatus = 'planned' | 'done' | 'rest' | 'none';
export interface Lesson {
  id: string;
  title: string;
  description: string;
  status: LessonStatus;
  prerequisites: string[];
  activityId: string;
  prompt: string;
  code: string;
  hints: string[];
}
export interface SchoolState {
  profile: { name: string; level: number; xp: number };
  lessons: Lesson[];
  equipment: { name: string; slot: string; description: string }[];
  calendar: { date: string; status: Exclude<CalendarStatus, 'none'> }[];
  messages: { id: string; scope: 'general' | 'lesson'; lessonId?: string; author: string; text: string }[];
  teacher: { authenticated: boolean; personality: TeacherPersonality; usagePaused: boolean; showWelcome: boolean };
  onlineValidated: boolean;
  executionAvailable: boolean;
}
export interface SchoolAPI {
  openUsage(): Promise<void>;
  signIn(): Promise<SchoolState>;
  signOut(): Promise<SchoolState>;
  resumeTeacher(): Promise<SchoolState>;
  dismissTeacherWelcome(): Promise<SchoolState>;
  setPersonality(value: TeacherPersonality): Promise<SchoolState>;
  getState(): Promise<SchoolState>;
  saveCode(activityId: string, code: string): Promise<SchoolState>;
  setCalendar(date: string, status: CalendarStatus): Promise<SchoolState>;
  sendMessage(scope: 'general' | 'lesson', text: string, lessonId?: string): Promise<SchoolState>;
}
declare global { interface Window { school?: SchoolAPI } }

