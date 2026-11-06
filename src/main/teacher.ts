import { skills } from '../domain';

export type Personality = 'acolhedor' | 'direto' | 'socratico';
export type ConversationMessage = { scope: string; lessonId?: string; author: string; text: string };
const styles: Record<Personality, string> = {
  acolhedor: 'Use um tom acolhedor e encorajador.',
  direto: 'Seja objetivo e claro, com explicações curtas.',
  socratico: 'Conduza o raciocínio com perguntas antes de entregar respostas.',
};
export function teacherContext(scope: 'general' | 'lesson', lessonId: string | undefined, personality: Personality, messages: ConversationMessage[]): string {
  const lesson = scope === 'lesson' ? skills.find(item => item.id === lessonId) : undefined;
  if (scope === 'lesson' && !lesson) throw new Error('Habilidade desconhecida.');
  const history = messages.filter(item => item.scope === scope && (scope === 'general' || item.lessonId === lessonId)).slice(-6)
    .map(item => `${item.author}: ${item.text.slice(0, 2000)}`).join('\n');
  return [styles[personality], lesson ? `Atividade atual: ${lesson.activities[0].prompt}` : '', history ? `Trechos recentes desta conversa:\n${history}` : ''].filter(Boolean).join('\n\n');
}
