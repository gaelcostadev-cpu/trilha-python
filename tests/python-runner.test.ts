import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PythonRunner, resultMessage } from '../src/renderer/PythonRunner';

describe('execução Python', () => {
  it('mantém a execução bloqueada quando o isolamento não está confirmado', () => {
    vi.stubGlobal('window', { school: { runPython: () => Promise.resolve() } });
    const view = renderToStaticMarkup(React.createElement(PythonRunner, { code: 'print(1)', runtime: { available: false, reason: 'Isolamento indisponível.' }, refreshRuntime: async () => {} }));
    expect(view).toContain('Execução indisponível. Isolamento indisponível.');
    expect(view).toMatch(/<button class="secondary" disabled=""[^>]*>Executar código<\/button>/);
    vi.unstubAllGlobals();
  });
  it('informa corretamente o resultado e os limites', () => {
    const base = { stdout: '', stderr: '' };
    expect(resultMessage({ ...base, reason: 'completed', exitCode: 0 })).toBe('Execução concluída.');
    expect(resultMessage({ ...base, reason: 'completed', exitCode: 1 })).toContain('erro');
    expect(resultMessage({ ...base, reason: 'completed' })).toContain('sem código');
    expect(resultMessage({ ...base, reason: 'cancelled' })).toContain('cancelada');
    expect(resultMessage({ ...base, reason: 'timeout' })).toContain('tempo excedido');
    expect(resultMessage({ ...base, reason: 'output_limit' })).toContain('excesso de saída');
  });
});
