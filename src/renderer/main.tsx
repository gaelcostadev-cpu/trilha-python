import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CalendarStatus, Lesson, SchoolState, TeacherPersonality } from './types';
import './style.css';
import { SkillTree } from '../tree/SkillTree';

type Page = 'trilha' | 'jornada' | 'agenda' | 'personagem' | 'ajustes';
const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'trilha', label: 'Minha trilha', icon: 'map' },
  { id: 'jornada', label: 'Jornada', icon: 'book' },
  { id: 'agenda', label: 'Calendário', icon: 'calendar' },
  { id: 'personagem', label: 'Personagem', icon: 'person' },
  { id: 'ajustes', label: 'Configurações', icon: 'settings' },
];
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17h2"/></>,
    person: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/></>,
    spark: <path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    chat: <><path d="M4 4h16v12H9l-5 4z"/><path d="M8 8h8M8 12h5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const statusLabel: Record<Lesson['status'], string> = { available: 'Disponível', locked: 'Bloqueada', completed: 'Concluída' };
const calendarLabel: Record<CalendarStatus, string> = { planned: 'Planejado', done: 'Feito', rest: 'Descanso', none: 'Sem registro' };
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function App() {
  const [state, setState] = useState<SchoolState | null>(null);
  const [page, setPage] = useState<Page>('trilha');
  const [selectedId, setSelectedId] = useState('');
  const [code, setCode] = useState('');
  const [date, setDate] = useState(today);
  const [chatScope, setChatScope] = useState<'general' | 'lesson'>('lesson');
  const [chatText, setChatText] = useState('');
  const [hintsShown, setHintsShown] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const welcomeDialog = useRef<HTMLDialogElement>(null);
  async function load() {
    setLoading(true); setMessage('');
    try {
      if (!window.school) throw new Error('A conexão com o aplicativo não está disponível.');
      const next = await window.school.getState(); setState(next);
      setSelectedId(current => current || next.lessons[0]?.id || '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar seus dados.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (state?.teacher.showWelcome && welcomeDialog.current && !welcomeDialog.current.open) welcomeDialog.current.showModal(); }, [state?.teacher.showWelcome]);
  const lesson = state?.lessons.find(item => item.id === selectedId);
  useEffect(() => { setCode(lesson?.code || ''); }, [lesson?.id, lesson?.code]);
  useEffect(() => { setHintsShown(0); }, [lesson?.id]);
  const completed = state?.lessons.filter(item => item.status === 'completed').length || 0;
  const chosenDay = state?.calendar.find(item => item.date === date);
  const messages = useMemo(() => state?.messages.filter(item => item.scope === chatScope && (chatScope === 'general' || item.lessonId === selectedId)) || [], [state, chatScope, selectedId]);
  async function update(operation: () => Promise<SchoolState>, success: string) {
    setSaving(true); setMessage('');
    try { setState(await operation()); setMessage(success); return true; }
    catch (error) { try { if (window.school) setState(await window.school.getState()); } catch { /* O aviso original continua visível. */ } setMessage(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.'); return false; }
    finally { setSaving(false); }
  }
  function changeLesson(id: string) { if (id !== selectedId && lesson && code !== lesson.code && !window.confirm('Há alterações não salvas. Deseja descartá-las e trocar de habilidade?')) return false; setSelectedId(id); return true; }
  function selectLesson(item: Lesson) { if (changeLesson(item.id)) setPage('jornada'); }
  async function dismissWelcome() {
    try { if (!window.school) throw new Error('Conexão indisponível.'); const next = await window.school.dismissTeacherWelcome(); welcomeDialog.current?.close(); setState(next); }
    catch { setMessage('Não foi possível salvar a confirmação.'); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span>p</span><span>y</span></div><div><strong>trilha<span>python</span></strong><small>SEU CAMINHO EM CÓDIGO</small></div></div>
      <div className="side-label">EXPLORAR</div>
      <nav aria-label="Navegação principal">{nav.map(item => <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><Icon name={item.icon}/><span>{item.label}</span>{page === item.id && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="side-note"><Icon name="spark"/><p>Um passo de cada vez.<br/><span>É assim que se aprende.</span></p></div><div className="profile-mini"><div className="avatar">{state?.profile.name?.slice(0, 1).toUpperCase() || '?'}</div><div><strong>{state?.profile.name || 'Estudante'}</strong><small>{state ? `Nível ${state.profile.level}` : 'Prévia local'}</small></div></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs">ESPAÇO DE APRENDIZADO <span>/</span> <strong>{nav.find(n => n.id === page)?.label}</strong></div><div className="top-status"><span className="status-dot"/> {state?.onlineValidated ? 'Conectado' : 'Prévia local'} <span className="top-divider"/> {state ? `${state.profile.xp} XP` : '— XP'}</div></header>
      <main>
        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage('')} aria-label="Fechar aviso">×</button></div>}
        {loading ? <div className="empty">Carregando sua jornada...</div> : !state ? <div className="empty"><h1>Não foi possível abrir a jornada</h1><p>Verifique a conexão com o aplicativo e tente novamente.</p><button className="primary" onClick={() => void load()}>Tentar novamente</button></div> : <>
        {!state.onlineValidated && <div className="offline-banner"><Icon name="lock" size={17}/><span><strong>Você está na prévia local.</strong> Aulas e professor aguardam validação online. Seu código e calendário podem ser salvos neste dispositivo.</span></div>}
        {page === 'trilha' && <><div className="page-heading"><div><div className="overline">SEU MAPA DE APRENDIZADO</div><h1>O caminho é seu<span className="title-period">.</span></h1><p>Explore as habilidades, descubra conexões e avance no seu ritmo.</p></div><div className="journey-count"><span>SEU PROGRESSO</span><strong>{completed}<i> / {state.lessons.length}</i></strong><small>habilidades concluídas</small></div></div>
          <div className="section-heading"><div><h2>Árvore de habilidades</h2><p>Cada ponto é uma nova descoberta.</p></div><div className="legend"><span><i className="legend-complete"/> Concluída</span><span><i className="legend-available"/> Disponível</span><span><i className="legend-locked"/> Bloqueada</span></div></div>
          {state.lessons.length ? <div className="tree-panel"><div className="tree-intro"><span>COMECE POR AQUI</span><div className="tree-line"/></div><SkillTree lessons={state.lessons} selectLesson={selectLesson}/><div className="tree-footer"><span>O conhecimento se constrói em conexões.</span><span>Selecione uma habilidade para explorar <Icon name="arrow" size={15}/></span></div></div> : <div className="empty"><h2>Sua trilha ainda está vazia</h2><p>As habilidades aparecerão aqui quando estiverem disponíveis.</p></div>}
          <div className="below-tree"><div><Icon name="spark"/><span><strong>Pequenos passos, grandes descobertas.</strong><br/>Sua jornada é feita no seu tempo.</span></div><button className="text-button" onClick={() => setPage('agenda')}>Organizar meus estudos <Icon name="arrow" size={16}/></button></div>
        </>}
        {page === 'jornada' && <><div className="page-heading compact"><div><div className="overline">SEU ESPAÇO DE PRÁTICA</div><h1>Jornada<span className="title-period">.</span></h1><p>Escolha uma habilidade e acompanhe seus próximos passos.</p></div></div><div className="workspace-grid"><section className="workspace-main"><label className="field-label" htmlFor="lesson-select">HABILIDADE</label><select id="lesson-select" value={selectedId} onChange={event => changeLesson(event.target.value)}>{state.lessons.map(item => <option key={item.id} value={item.id}>{item.title} · {statusLabel[item.status]}</option>)}</select>{lesson ? <><div className="lesson-heading"><div><span className={`status-pill ${lesson.status}`}>{statusLabel[lesson.status]}</span><h2>{lesson.title}</h2><p>{lesson.description}</p></div><span className="lesson-number">{String(state.lessons.indexOf(lesson) + 1).padStart(2, '0')}</span></div><div className="prerequisites"><strong>Proposta da atividade</strong><p>{lesson.prompt}</p></div><div className="prerequisites"><strong>Conexões anteriores</strong><p>{lesson.prerequisites.length ? lesson.prerequisites.map(id => state.lessons.find(item => item.id === id)?.title || id).join(' · ') : 'Esta habilidade não possui pré-requisitos.'}</p></div><div className="editor-heading"><div><h3>Seu espaço de código</h3><p>Escreva e salve suas ideias localmente.</p></div><span>PYTHON</span></div><label className="sr-only" htmlFor="code-editor">Código Python para {lesson.title}</label><textarea id="code-editor" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} placeholder="# Escreva seu código aqui"/><div className="editor-actions"><button className="primary" disabled={saving || !window.school} onClick={() => window.school && void update(() => window.school!.saveCode(lesson.activityId, code), 'Código salvo neste dispositivo.')}>Salvar código</button><button className="secondary" disabled title="Execução indisponível nesta versão">Executar código</button><span>Execução indisponível</span></div><section className="hints" aria-labelledby="hints-title"><h3 id="hints-title">Dicas para esta habilidade</h3>{lesson.hints.length ? <><ol aria-live="polite">{lesson.hints.slice(0, hintsShown).map((hint, i) => <li key={i}>{hint}</li>)}</ol><button className="secondary" disabled={hintsShown >= lesson.hints.length} onClick={() => setHintsShown(count => Math.min(count + 1, lesson.hints.length))}>{hintsShown >= lesson.hints.length ? 'Todas as dicas foram exibidas' : hintsShown ? 'Ver próxima dica' : 'Ver primeira dica'}</button></> : <p>As dicas aparecerão quando estiverem disponíveis.</p>}</section></> : <div className="empty"><h2>Nenhuma habilidade disponível</h2><p>Volte à trilha para explorar quando houver conteúdo.</p></div>}</section><Chat state={state} lesson={lesson} scope={chatScope} setScope={setChatScope} messages={messages} text={chatText} setText={setChatText} saving={saving} send={() => { if (!window.school || !chatText.trim()) return; void update(() => window.school!.sendMessage(chatScope, chatText.trim(), chatScope === 'lesson' ? lesson?.id : undefined), 'Mensagem enviada.').then(sent => { if (sent) setChatText(''); }); }}/></div></>}
        {page === 'agenda' && <><div className="page-heading compact"><div><div className="overline">UM DIA DE CADA VEZ</div><h1>Seu calendário<span className="title-period">.</span></h1><p>Planeje os estudos e reserve espaço para descansar.</p></div></div><div className="calendar-layout"><section className="panel"><h2>Registrar um dia</h2><p>Escolha uma data e marque como ela faz parte da sua rotina.</p><label className="field-label" htmlFor="calendar-date">DATA</label><input id="calendar-date" type="date" value={date} onChange={event => setDate(event.target.value)}/><p className="current-day">Registro atual: <strong>{calendarLabel[chosenDay?.status || 'none']}</strong></p><div className="calendar-actions">{(['planned','done','rest','none'] as CalendarStatus[]).map(status => <button key={status} className={chosenDay?.status === status || (!chosenDay && status === 'none') ? 'choice selected' : 'choice'} aria-pressed={chosenDay?.status === status || (!chosenDay && status === 'none')} disabled={!date || saving} onClick={() => window.school && void update(() => window.school!.setCalendar(date, status), 'Calendário atualizado.')}>{calendarLabel[status]}</button>)}</div></section><section className="panel"><h2>Seus registros</h2><p>Seu ritmo, do seu jeito.</p>{state.calendar.length ? <ul className="record-list">{[...state.calendar].sort((a,b) => b.date.localeCompare(a.date)).map(item => <li key={item.date}><time dateTime={item.date}>{item.date.split('-').reverse().join('/')}</time><span className={`day-status ${item.status}`}>{calendarLabel[item.status]}</span></li>)}</ul> : <div className="empty-inline">Nenhum dia registrado ainda.</div>}</section></div></>}
        {page === 'personagem' && <><div className="page-heading compact"><div><div className="overline">SUA EVOLUÇÃO</div><h1>Personagem<span className="title-period">.</span></h1><p>Uma lembrança de tudo o que você está construindo.</p></div></div><div className="character-layout"><section className="character-card"><div className="character-avatar">{state.profile.name?.slice(0,1).toUpperCase() || '?'}</div><h2>{state.profile.name}</h2><p>Explorador de Python</p><div className="character-stats"><div><small>NÍVEL</small><strong>{state.profile.level}</strong></div><div><small>EXPERIÊNCIA</small><strong>{state.profile.xp} <span>XP</span></strong></div></div></section><section className="panel equipment"><h2>Equipamentos</h2><p>Itens da sua jornada aparecem aqui.</p>{state.equipment.length ? <ul>{state.equipment.map((item, i) => <li key={`${item.slot}-${i}`}><span className="equipment-icon"><Icon name="spark"/></span><div><small>{item.slot}</small><strong>{item.name}</strong><p>{item.description}</p></div></li>)}</ul> : <div className="empty-inline">Você ainda não possui equipamentos.</div>}</section></div></>}
        {page === 'ajustes' && <><div className="page-heading compact"><div><div className="overline">SEU ESPAÇO, SUAS INFORMAÇÕES</div><h1>Configurações<span className="title-period">.</span></h1><p>Entenda o estado atual do aplicativo.</p></div></div><section className="panel settings-panel"><h2>Estado da conexão</h2><div className="setting-row"><div><strong>Validação online</strong><p>Necessária para acessar as atividades de aprendizagem e o professor.</p></div><span className="setting-value">{state.onlineValidated ? 'Validada' : 'Indisponível'}</span></div><div className="setting-row"><div><strong>Execução de código</strong><p>O editor permite salvar rascunhos neste dispositivo.</p></div><span className="setting-value">Indisponível</span></div><div className="setting-row"><div><strong>Conta do professor</strong><p>{state.teacher.authenticated ? 'Conta conectada.' : 'Entre para conversar com o professor, quando o serviço estiver disponível.'}</p></div><button className="secondary" disabled={saving || !window.school} onClick={() => window.school && void update(() => state.teacher.authenticated ? window.school!.signOut() : window.school!.signIn(), state.teacher.authenticated ? 'Conta desconectada.' : 'Conta conectada.')}>{state.teacher.authenticated ? 'Sair' : 'Continuar com ChatGPT'}</button></div>{state.teacher.authenticated && !state.onlineValidated && <div className="setting-row"><div><strong>Validar novamente</strong><p>Entre novamente caso a autorização tenha expirado ou a verificação tenha falhado.</p></div><button className="secondary" disabled={saving} onClick={() => window.school && void update(() => window.school!.signIn(), 'Conta conectada.')}>Reconectar</button></div>}<div className="setting-row"><div><label htmlFor="teacher-personality"><strong>Estilo do professor</strong></label><p>Escolha como o professor deve orientar a conversa.</p></div><select id="teacher-personality" value={state.teacher.personality} disabled={saving || !window.school} onChange={event => window.school && void update(() => window.school!.setPersonality(event.target.value as TeacherPersonality), 'Estilo do professor atualizado.')}><option value="acolhedor">Acolhedor</option><option value="direto">Direto</option><option value="socratico">Socrático</option></select></div><div className="setting-row"><div><strong>Uso do ChatGPT</strong><p>Abra as configurações do ChatGPT para consultar uso e limites.</p></div><button className="secondary" onClick={() => { void window.school?.openUsage().catch(() => setMessage('Não foi possível abrir as configurações do ChatGPT.')); }}>Gerenciar uso</button></div>{state.teacher.usagePaused && <div className="setting-row"><div><strong>Solicitações pausadas</strong><p>Após consultar os limites de uso do ChatGPT, retome quando desejar.</p></div><button className="secondary" disabled={saving} onClick={() => window.school && void update(() => window.school!.resumeTeacher(), 'Solicitações retomadas.')}>Retomar solicitações</button></div>}<div className="setting-row"><div><strong>Dados locais</strong><p>Seu código e seus registros de calendário ficam salvos neste dispositivo.</p></div><span className="setting-value">Local</span></div></section></>}
        </>}
      </main><footer>TRILHA PYTHON <span>·</span> APRENDER É UMA JORNADA</footer></div>
    <dialog className="welcome-dialog" ref={welcomeDialog} aria-labelledby="welcome-title" onCancel={event => { event.preventDefault(); void dismissWelcome(); }}>
      <h2 id="welcome-title">Seu plano ChatGPT está conectado</h2>
      <p>As solicitações elegíveis ao professor usam seu plano ChatGPT ou créditos disponíveis. Você pode consultar o uso e os limites nas configurações do ChatGPT.</p>
      <button className="primary" autoFocus onClick={() => void dismissWelcome()}>Entendi</button>
    </dialog>
  </div>;
}
function Chat({ state, lesson, scope, setScope, messages, text, setText, saving, send }: {state: SchoolState; lesson?: Lesson; scope: 'general'|'lesson'; setScope: (scope:'general'|'lesson') => void; messages: SchoolState['messages']; text: string; setText: (text:string) => void; saving: boolean; send: () => void}) {
  const available = state.onlineValidated && state.teacher.authenticated && !state.teacher.usagePaused;
  return <aside className="chat-panel"><div className="chat-title"><div className="chat-icon"><Icon name="chat"/></div><div><h2>Professor de IA</h2><p>Converse sobre sua jornada</p></div></div><div className="chat-tabs" role="group" aria-label="Contexto da conversa"><button className={scope === 'lesson' ? 'selected' : ''} aria-pressed={scope === 'lesson'} onClick={() => setScope('lesson')}>Esta habilidade</button><button className={scope === 'general' ? 'selected' : ''} aria-pressed={scope === 'general'} onClick={() => setScope('general')}>Geral</button></div><div className="chat-context">{scope === 'lesson' ? lesson?.title || 'Nenhuma habilidade selecionada' : 'Conversa geral'}</div><div className="chat-messages" aria-live="polite">{messages.length ? messages.map(item => <div className="chat-message" key={item.id}><strong>{item.author}</strong><p>{item.text}</p></div>) : <div className="chat-empty"><Icon name="chat" size={28}/><strong>A conversa começa aqui</strong><p>{available ? 'Ainda não há mensagens neste espaço.' : 'Entre em Configurações e aguarde a validação online para conversar.'}</p></div>}</div><p className="chat-unavailable">Ao enviar, sua mensagem, até seis mensagens recentes desta conversa e o enunciado da atividade selecionada são enviados à OpenAI. Seu código não é enviado automaticamente.</p><label className="sr-only" htmlFor="chat-input">Sua mensagem</label><textarea id="chat-input" placeholder="Escreva uma mensagem..." value={text} onChange={event => setText(event.target.value)} disabled={!available}/><button className="primary chat-send" disabled={!available || saving || !text.trim() || (scope === 'lesson' && !lesson)} onClick={send}>{saving ? 'Enviando...' : 'Enviar mensagem'} <Icon name="arrow" size={16}/></button>{!available && <small className="chat-unavailable">{state.teacher.usagePaused ? 'Uso pausado. Consulte seus limites e retome em Configurações.' : 'Conversa disponível após login e validação online.'}</small>}</aside>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);





