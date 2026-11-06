import { useId, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import './tree.css';

export interface TreeLesson {
  id: string;
  title: string;
  status: 'available' | 'locked' | 'completed';
  prerequisites: string[];
}

const statusLabel = { available: 'Disponível', locked: 'Bloqueada', completed: 'Concluída' };
const MAP_WIDTH = 900;
const ROW_HEIGHT = 200;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.5;

export function treePoint(index: number) {
  const row = Math.floor(index / 3);
  const column = row % 2 ? 2 - index % 3 : index % 3;
  return { x: 150 + column * 300, y: 100 + row * ROW_HEIGHT };
}

function TreeIcon({ name }: { name: 'check' | 'lock' | 'spark' | 'plus' | 'minus' | 'reset' | 'up' | 'down' | 'left' | 'right' }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2"/></>,
    spark: <><path d="M12 4v16M4 12h16M7 7l10 10M17 7 7 17"/><circle cx="12" cy="12" r="3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>,
    reset: <><path d="M4 10a8 8 0 1 1 2 7M4 4v6h6"/></>,
    up: <path d="m6 14 6-6 6 6"/>, down: <path d="m6 10 6 6 6-6"/>,
    left: <path d="m14 6-6 6 6 6"/>, right: <path d="m10 6 6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** Renders only supplied lessons and their actual prerequisite connections. */
export function SkillTree<T extends TreeLesson>({ lessons, selectLesson }: { lessons: T[]; selectLesson: (lesson: T) => void }) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const helpId = useId();
  const height = Math.max(ROW_HEIGHT, Math.ceil(lessons.length / 3) * ROW_HEIGHT);
  const adjustZoom = (amount: number) => setZoom(current => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((current + amount) * 10) / 10)));
  const pan = (x: number, y: number) => viewport.current?.scrollBy({ left: x, top: y, behavior: 'smooth' });
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-120, 0], ArrowRight: [120, 0], ArrowUp: [0, -120], ArrowDown: [0, 120] };
    if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); adjustZoom(0.1); }
    else if (event.key === '-') { event.preventDefault(); adjustZoom(-0.1); }
    else if (event.key === '0') { event.preventDefault(); setZoom(1); }
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  }
  return <div className="python-tree">
    <div className="python-tree-toolbar">
      <p id={helpId}>Arraste o mapa para explorar. Use as setas para mover e + ou − para ampliar.</p>
      <div className="python-tree-controls" aria-label="Controles do mapa">
        <button type="button" onClick={() => pan(-180, 0)} aria-label="Mover para a esquerda"><TreeIcon name="left"/></button>
        <button type="button" onClick={() => pan(180, 0)} aria-label="Mover para a direita"><TreeIcon name="right"/></button>
        <button type="button" onClick={() => pan(0, -180)} aria-label="Mover para cima"><TreeIcon name="up"/></button>
        <button type="button" onClick={() => pan(0, 180)} aria-label="Mover para baixo"><TreeIcon name="down"/></button>
        <span className="python-tree-divider" aria-hidden="true"/>
        <button type="button" onClick={() => adjustZoom(-0.1)} disabled={zoom <= MIN_ZOOM} aria-label="Reduzir mapa"><TreeIcon name="minus"/></button>
        <output aria-label="Ampliação do mapa">{Math.round(zoom * 100)}%</output>
        <button type="button" onClick={() => adjustZoom(0.1)} disabled={zoom >= MAX_ZOOM} aria-label="Ampliar mapa"><TreeIcon name="plus"/></button>
        <button type="button" onClick={() => { setZoom(1); viewport.current?.scrollTo({ left: 0, top: 0 }); }} aria-label="Restaurar visualização"><TreeIcon name="reset"/></button>
      </div>
    </div>
    <div className="python-tree-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Mapa de habilidades" aria-describedby={helpId} onKeyDown={onKeyDown} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div style={{ width: MAP_WIDTH * zoom, height: height * zoom }}>
        <div className="python-tree-map" style={{ width: MAP_WIDTH, height, transform: `scale(${zoom})` }}>
          <svg className="python-tree-links" viewBox={`0 0 ${MAP_WIDTH} ${height}`} aria-hidden="true">
            {lessons.flatMap((lesson, index) => lesson.prerequisites.map(id => {
              const parentIndex = lessons.findIndex(item => item.id === id);
              if (parentIndex < 0) return null;
              const from = treePoint(parentIndex); const to = treePoint(index);
              return <line key={`${id}-${lesson.id}`} className={lessons[parentIndex].status === 'completed' ? 'is-complete' : ''} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>;
            }))}
          </svg>
          {lessons.map((lesson, index) => {
            const position = treePoint(index);
            return <button type="button" key={lesson.id} className={`python-tree-node ${lesson.status}`} style={{ left: position.x, top: position.y }} onClick={() => selectLesson(lesson)} aria-label={`${lesson.title}, ${statusLabel[lesson.status]}. Abrir detalhes.`}>
              <span className="python-tree-orb"><TreeIcon name={lesson.status === 'completed' ? 'check' : lesson.status === 'locked' ? 'lock' : 'spark'}/></span>
              <span className="python-tree-name">{lesson.title}</span><span className="python-tree-state">{statusLabel[lesson.status]}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
  </div>;
}
