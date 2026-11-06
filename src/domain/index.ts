export interface TestCase { input: string; expected: string }
export interface Challenge {
  id: string;
  title: string;
  prompt: string;
  starter: string;
  hints: string[];
  tests: TestCase[];
  requiresStructuralVerification?: boolean;
}
export interface Skill {
  id: string;
  title: string;
  description: string;
  prerequisite: string | null;
  activities: Challenge[];
  exam: Challenge;
}

const starter = '# Leia a entrada com input() e mostre a resposta com print().\n';

export const skills: Skill[] = [
  {
    id: 'saida', title: 'Primeiros passos', description: 'Mostre mensagens e use a entrada de dados.', prerequisite: null,
    activities: [
      { id: 'ola', title: 'Uma saudação', prompt: 'Imprima exatamente: Olá, Python!', starter, hints: ['Use print com o texto entre aspas.'], tests: [{ input: '', expected: 'Olá, Python!\n' }] },
      { id: 'nome', title: 'Boas-vindas', prompt: 'Leia um nome e imprima Bem-vinda, seguido de um espaço e do nome.', starter, hints: ['Guarde input() em uma variável.', 'print pode juntar textos.'], tests: [{ input: 'Lia\n', expected: 'Bem-vinda, Lia\n' }, { input: 'Ana Clara\n', expected: 'Bem-vinda, Ana Clara\n' }, { input: 'Z\n', expected: 'Bem-vinda, Z\n' }] },
    ],
    exam: { id: 'prova-saida', title: 'Prova: primeiros passos', prompt: 'Leia uma cidade e imprima: Destino: seguido de um espaço e do nome da cidade.', starter, hints: ['Leia com input() e imprima o texto solicitado.'], tests: [{ input: 'Recife\n', expected: 'Destino: Recife\n' }, { input: 'São Paulo\n', expected: 'Destino: São Paulo\n' }, { input: 'Natal\n', expected: 'Destino: Natal\n' }] },
  },
  {
    id: 'variaveis', title: 'Números e variáveis', description: 'Converta entradas e faça contas.', prerequisite: 'saida',
    activities: [
      { id: 'dobro', title: 'O dobro', prompt: 'Leia um número inteiro e imprima seu dobro.', starter, hints: ['Converta a entrada com int().'], tests: [{ input: '4\n', expected: '8\n' }, { input: '-3\n', expected: '-6\n' }, { input: '0\n', expected: '0\n' }] },
      { id: 'soma', title: 'Soma de dois', prompt: 'Leia dois inteiros, um por linha, e imprima a soma.', starter, hints: ['Leia e converta cada linha separadamente.'], tests: [{ input: '2\n3\n', expected: '5\n' }, { input: '-5\n2\n', expected: '-3\n' }, { input: '0\n0\n', expected: '0\n' }] },
    ],
    exam: { id: 'prova-variaveis', title: 'Prova: números', prompt: 'Leia dois inteiros, um por linha, e imprima a diferença do primeiro pelo segundo.', starter, hints: ['Subtraia o segundo número do primeiro.'], tests: [{ input: '7\n4\n', expected: '3\n' }, { input: '1\n5\n', expected: '-4\n' }, { input: '-2\n-2\n', expected: '0\n' }] },
  },
  {
    id: 'condicoes', title: 'Decisões', description: 'Escolha caminhos com condições.', prerequisite: 'variaveis',
    activities: [
      { id: 'paridade', title: 'Par ou ímpar', prompt: 'Leia um inteiro e imprima par se ele for par; caso contrário, imprima ímpar.', starter, hints: ['O resto da divisão por 2 indica a paridade.'], tests: [{ input: '0\n', expected: 'par\n' }, { input: '7\n', expected: 'ímpar\n' }, { input: '-4\n', expected: 'par\n' }] },
      { id: 'maioridade', title: 'Idade', prompt: 'Leia uma idade inteira e imprima adulta se for pelo menos 18; caso contrário, imprima menor.', starter, hints: ['Compare a idade com 18 usando >=.'], tests: [{ input: '17\n', expected: 'menor\n' }, { input: '18\n', expected: 'adulta\n' }, { input: '30\n', expected: 'adulta\n' }] },
    ],
    exam: { id: 'prova-condicoes', title: 'Prova: decisões', prompt: 'Leia um inteiro e imprima positivo, negativo ou zero conforme seu valor.', starter, hints: ['Compare o número com zero.'], tests: [{ input: '5\n', expected: 'positivo\n' }, { input: '-1\n', expected: 'negativo\n' }, { input: '0\n', expected: 'zero\n' }] },
  },
  {
    id: 'repeticoes', title: 'Repetições', description: 'Repita operações e acumule resultados.', prerequisite: 'condicoes',
    activities: [
      { id: 'contagem', title: 'Contagem', prompt: 'Leia um inteiro n maior ou igual a 1 e imprima os números de 1 até n, um por linha.', starter, hints: ['range(1, n + 1) inclui n.'], tests: [{ input: '1\n', expected: '1\n' }, { input: '3\n', expected: '1\n2\n3\n' }, { input: '5\n', expected: '1\n2\n3\n4\n5\n' }] },
      { id: 'acumulador', title: 'Soma da contagem', prompt: 'Leia um inteiro n maior ou igual a zero e imprima a soma dos inteiros de 1 até n.', starter, hints: ['Comece uma soma em zero e acrescente cada número.'], tests: [{ input: '0\n', expected: '0\n' }, { input: '1\n', expected: '1\n' }, { input: '5\n', expected: '15\n' }] },
    ],
    exam: { id: 'prova-repeticoes', title: 'Prova: repetições', prompt: 'Leia um inteiro n maior ou igual a 1 e imprima os múltiplos de 3 de 3 até 3 × n, um por linha.', starter, hints: ['Para cada número de 1 a n, multiplique por 3.'], tests: [{ input: '1\n', expected: '3\n' }, { input: '2\n', expected: '3\n6\n' }, { input: '4\n', expected: '3\n6\n9\n12\n' }] },
  },
  {
    id: 'listas', title: 'Listas', description: 'Percorra e transforme coleções de números.', prerequisite: 'repeticoes',
    activities: [
      { id: 'quantidade', title: 'Quantidade de itens', prompt: 'Leia uma linha com inteiros separados por espaços e imprima quantos números ela contém. A linha pode estar vazia.', starter, hints: ['split() separa os itens; len() conta.'], tests: [{ input: '\n', expected: '0\n' }, { input: '9\n', expected: '1\n' }, { input: '2 7 -1\n', expected: '3\n' }] },
      { id: 'soma-lista', title: 'Soma da lista', prompt: 'Leia uma linha com inteiros separados por espaços e imprima a soma. Se a linha estiver vazia, imprima 0.', starter, hints: ['Converta cada item para int antes de somar.'], tests: [{ input: '\n', expected: '0\n' }, { input: '2 3 4\n', expected: '9\n' }, { input: '-5 2\n', expected: '-3\n' }] },
    ],
    exam: { id: 'prova-listas', title: 'Prova: listas', prompt: 'Leia uma linha com inteiros separados por espaços e imprima quantos são positivos. A linha pode estar vazia.', starter, hints: ['Conte apenas os valores maiores que zero.'], tests: [{ input: '\n', expected: '0\n' }, { input: '-1 0 2 4\n', expected: '2\n' }, { input: '3\n', expected: '1\n' }, { input: '-2 -1\n', expected: '0\n' }] },
  },
  {
    id: 'funcoes', title: 'Funções', description: 'Organize uma solução em uma função reutilizável.', prerequisite: 'listas',
    activities: [
      { id: 'funcao-triplo', title: 'Função triplo', prompt: 'Defina triplo(n), que retorna o triplo de n. Leia um inteiro e imprima o resultado de triplo.', starter, hints: ['Use def triplo(n): e return.'], tests: [{ input: '2\n', expected: '6\n' }, { input: '-3\n', expected: '-9\n' }, { input: '0\n', expected: '0\n' }] },
      { id: 'funcao-maior', title: 'Função maior', prompt: 'Defina maior(a, b), que retorna o maior valor. Leia dois inteiros, um por linha, e imprima o resultado.', starter, hints: ['Retorne um dos valores após compará-los.'], tests: [{ input: '3\n8\n', expected: '8\n' }, { input: '9\n-1\n', expected: '9\n' }, { input: '4\n4\n', expected: '4\n' }] },
    ],
    exam: { id: 'prova-funcoes', requiresStructuralVerification: true, title: 'Prova: funções', prompt: 'Defina absoluto(n), que retorna o valor absoluto de n. Leia um inteiro e imprima o resultado.', starter, hints: ['Se n for negativo, retorne -n.'], tests: [{ input: '-7\n', expected: '7\n' }, { input: '0\n', expected: '0\n' }, { input: '8\n', expected: '8\n' }] },
  },
];

export interface ExamAttempt { passed: boolean; hintsUsed: number }
export interface Progress {
  completedActivities: string[];
  exams: Record<string, ExamAttempt[]>;
  xp: number;
  reviewRequired: string | null;
}
export interface TestResult { passed: boolean[]; hintsUsed: number }
export interface Eligibility { allowed: boolean; reason: string }

export function initialProgress(): Progress {
  return { completedActivities: [], exams: {}, xp: 0, reviewRequired: null };
}

function getSkill(id: string): Skill {
  const skill = skills.find((item) => item.id === id);
  if (!skill) throw new Error('Habilidade desconhecida.');
  return skill;
}

export function hasPassedExam(progress: Progress, skillId: string): boolean {
  getSkill(skillId);
  return (progress.exams[skillId] ?? []).some((attempt) => attempt.passed);
}

export function skillEligibility(progress: Progress, skillId: string): Eligibility {
  const skill = getSkill(skillId);
  if (progress.reviewRequired) return { allowed: false, reason: 'Conclua a revisão indicada pelo diagnóstico.' };
  return !skill.prerequisite || hasPassedExam(progress, skill.prerequisite)
    ? { allowed: true, reason: '' }
    : { allowed: false, reason: 'Conclua a prova da habilidade anterior.' };
}

function validateResult(challenge: Challenge, result: TestResult): void {
  if (!result || !Array.isArray(result.passed) || result.passed.length !== challenge.tests.length ||
      result.passed.some((item) => typeof item !== 'boolean') ||
      !Number.isInteger(result.hintsUsed) || result.hintsUsed < 0 || result.hintsUsed > challenge.hints.length) {
    throw new Error('Resultado de testes ou quantidade de dicas inválidos.');
  }
}

export function completeActivity(progress: Progress, skillId: string, activityId: string, result: TestResult): Progress {
  const skill = getSkill(skillId);
  if (!skillEligibility(progress, skillId).allowed) throw new Error('Habilidade bloqueada.');
  const activity = skill.activities.find((item) => item.id === activityId);
  if (!activity) throw new Error('Atividade desconhecida.');
  validateResult(activity, result);
  if (!result.passed.every(Boolean) || progress.completedActivities.includes(activityId)) return progress;
  return { ...progress, completedActivities: [...progress.completedActivities, activityId], xp: progress.xp + 20 };
}

export function examEligibility(progress: Progress, skillId: string): Eligibility {
  const skill = getSkill(skillId);
  const unlocked = skillEligibility(progress, skillId);
  if (!unlocked.allowed) return unlocked;
  if (skill.exam.requiresStructuralVerification) return { allowed: false, reason: 'Esta prova exige verificar a definição da função, recurso ainda indisponível.' };
  return skill.activities.every((activity) => progress.completedActivities.includes(activity.id))
    ? { allowed: true, reason: '' }
    : { allowed: false, reason: 'Conclua todas as atividades desta habilidade.' };
}

export function recordExam(progress: Progress, skillId: string, result: TestResult): Progress {
  const skill = getSkill(skillId);
  if (!examEligibility(progress, skillId).allowed) throw new Error('Prova bloqueada.');
  validateResult(skill.exam, result);
  const passed = result.passed.every(Boolean);
  const previouslyPassed = hasPassedExam(progress, skillId);
  const attempt: ExamAttempt = { passed, hintsUsed: result.hintsUsed };
  return {
    ...progress,
    exams: { ...progress.exams, [skillId]: [...(progress.exams[skillId] ?? []), attempt] },
    xp: progress.xp + (passed && !previouslyPassed ? (result.hintsUsed ? 30 : 60) : 0),
  };
}

export function canReview(progress: Progress, skillId: string): Eligibility {
  return progress.reviewRequired === skillId || hasPassedExam(progress, skillId)
    ? { allowed: true, reason: '' }
    : { allowed: false, reason: 'Passe na prova desta habilidade para liberar a revisão.' };
}

export function reviewActivities(progress: Progress, skillId: string): Challenge[] {
  if (!canReview(progress, skillId).allowed) throw new Error('Revisão bloqueada.');
  return getSkill(skillId).activities;
}

export function achievements(progress: Progress): string[] {
  const unlocked: string[] = [];
  if (progress.completedActivities.length > 0) unlocked.push('Primeiro passo');
  if (skills.some((skill) => hasPassedExam(progress, skill.id))) unlocked.push('Primeira prova');
  if (skills.every((skill) => hasPassedExam(progress, skill.id))) unlocked.push('Trilha concluída');
  if (skills.some((skill) => (progress.exams[skill.id] ?? []).some((attempt) => attempt.passed && attempt.hintsUsed === 0))) unlocked.push('Sem dicas');
  return unlocked;
}

/** O diagnóstico orienta o estudo; ele não altera nem desbloqueia o progresso. */
export function diagnose(answers: Partial<Record<string, boolean>>): { skillId: string; message: string } {
  const firstGap = skills.find((skill) => answers[skill.id] !== true);
  return firstGap
    ? { skillId: firstGap.id, message: `Comece por ${firstGap.title}.` }
    : { skillId: skills[skills.length - 1].id, message: 'Você conhece os temas da trilha; revise e pratique.' };
}

/** Confirma o diagnóstico e exige uma revisão na primeira habilidade acessível com lacuna. */
export function confirmDiagnosis(progress: Progress, answers: Partial<Record<string, boolean>>): Progress {
  if (progress.reviewRequired) throw new Error('Já existe uma revisão pendente.');
  const accessible = skills.filter((skill) => !skill.prerequisite || hasPassedExam(progress, skill.prerequisite));
  const target = accessible.find((skill) => answers[skill.id] !== true);
  return target ? { ...progress, reviewRequired: target.id } : progress;
}

/** A revisão só é concluída quando todos os casos de todas as atividades passam. */
export function completeReview(progress: Progress, skillId: string, results: TestResult[]): Progress {
  if (progress.reviewRequired !== skillId) throw new Error('Esta revisão não está pendente.');
  const activities = getSkill(skillId).activities;
  if (!Array.isArray(results) || results.length !== activities.length) throw new Error('Resultados de revisão incompletos.');
  activities.forEach((activity, index) => validateResult(activity, results[index]));
  return results.every((result) => result.passed.every(Boolean))
    ? { ...progress, reviewRequired: null }
    : progress;
}
