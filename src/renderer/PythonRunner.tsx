import React, { useEffect, useRef, useState } from 'react';
import type { PythonResult, RuntimeStatus } from './types';

export function resultMessage(result: PythonResult): string {
  if (result.reason === 'cancelled') return 'Execução cancelada.';
  if (result.reason === 'timeout') return 'Execução interrompida por tempo excedido.';
  if (result.reason === 'output_limit') return 'Execução interrompida por excesso de saída.';
  if (result.exitCode === 0) return 'Execução concluída.';
  if (typeof result.exitCode === 'number') return `Execução terminou com erro (código ${result.exitCode}).`;
  return 'Execução encerrada sem código de saída.';
}

export function PythonRunner({ code, runtime, refreshRuntime }: { code: string; runtime: RuntimeStatus | null; refreshRuntime: () => Promise<void> }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<PythonResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) void window.school?.cancelPython().catch(() => {});
    };
  }, []);

  async function run() {
    if (active.current || !runtime?.available || !window.school?.runPython) return;
    active.current = true;
    setRunning(true); setError(''); setResult(null);
    try {
      const next = await window.school.runPython(code, input);
      if (mounted.current) setResult(next);
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível executar o código.');
        void refreshRuntime();
      }
    } finally {
      active.current = false;
      if (mounted.current) { setRunning(false); setCancelling(false); }
    }
  }
  async function cancel() {
    if (!active.current || cancelling || !window.school?.cancelPython) return;
    setCancelling(true);
    try {
      if (!await window.school.cancelPython() && mounted.current) setError('A execução já terminou ou não pôde ser cancelada.');
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a execução.');
    } finally { if (mounted.current) setCancelling(false); }
  }

  return <section className="python-runner" aria-labelledby="execution-title">
    <h3 id="execution-title">Executar código</h3>
    <p className="runtime-status" role="status">{runtime ? (runtime.available ? `Execução disponível. ${runtime.reason}` : `Execução indisponível. ${runtime.reason}`) : 'Verificando a segurança da execução...'}</p>
    {runtime && !runtime.available && <button className="secondary" onClick={() => void refreshRuntime()}>Verificar novamente</button>}
    <label className="field-label" htmlFor="python-input">ENTRADA DO PROGRAMA</label>
    <p id="python-input-help">Informe aqui as respostas para o programa, uma por linha.</p>
    <textarea id="python-input" aria-describedby="python-input-help" value={input} onChange={event => setInput(event.target.value)} spellCheck={false}/>
    <div className="editor-actions">
      <button className="secondary" disabled={!runtime?.available || running || !window.school?.runPython} onClick={() => void run()}>Executar código</button>
      {running && <button className="secondary" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? 'Cancelando...' : 'Cancelar execução'}</button>}
    </div>
    <div className="execution-result" aria-live="polite" aria-atomic="true">
      {running && <p>Executando código...</p>}
      {error && <p>{error}</p>}
      {result && <><p>{resultMessage(result)}</p><h4>Saída</h4><pre tabIndex={0}>{result.stdout || '(sem saída)'}</pre>{result.stderr && <><h4>Erros</h4><pre tabIndex={0}>{result.stderr}</pre></>}</>}
    </div>
  </section>;
}
