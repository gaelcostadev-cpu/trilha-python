import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillTree, treePoint } from './SkillTree';

describe('árvore de habilidades', () => {
  it('desenha apenas as conexões existentes e identifica o estado dos nós', () => {
    const lessons = [
      { id: 'a', title: 'Primeiro', status: 'completed' as const, prerequisites: [] },
      { id: 'b', title: 'Segundo', status: 'available' as const, prerequisites: ['a', 'ausente'] },
      { id: 'c', title: 'Terceiro', status: 'locked' as const, prerequisites: [] },
    ];
    const html = renderToStaticMarkup(createElement(SkillTree, { lessons, selectLesson: () => {} }));
    expect((html.match(/<line /g) ?? [])).toHaveLength(1);
    expect(html).toContain('Primeiro, Concluída');
    expect(html).toContain('Segundo, Disponível');
    expect(html).toContain('Terceiro, Bloqueada');
  });
  it('continua o caminho na linha seguinte sem sobrepor nós', () => {
    expect(treePoint(2).x).toBe(treePoint(3).x);
    expect(treePoint(3).y).toBeGreaterThan(treePoint(2).y);
    expect(new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(treePoint(i)))).size).toBe(6);
  });
});

