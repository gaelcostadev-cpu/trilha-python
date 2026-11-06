import { describe, expect, it } from 'vitest';
import { teacherContext } from '../src/main/teacher';
describe('contexto do professor', () => {
  it('inclui somente a conversa da habilidade solicitada e o estilo', () => {
    const context = teacherContext('lesson', 'saida', 'socratico', [
      { scope: 'lesson', lessonId: 'saida', author: 'Você', text: 'mensagem atual' },
      { scope: 'lesson', lessonId: 'variaveis', author: 'Você', text: 'outro contexto secreto' },
      { scope: 'general', author: 'Você', text: 'conversa geral privada' },
    ]);
    expect(context).toContain('mensagem atual');
    expect(context).toContain('perguntas');
    expect(context).not.toContain('outro contexto secreto');
    expect(context).not.toContain('conversa geral privada');
  });
  it('limita o histórico e rejeita habilidade desconhecida', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({ scope: 'general', author: 'Você', text: `item-${index}` }));
    const context = teacherContext('general', undefined, 'direto', messages);
    expect(context).not.toContain('item-3');
    expect(context).toContain('item-4');
    expect(() => teacherContext('lesson', 'inexistente', 'direto', messages)).toThrow('desconhecida');
  });
});
