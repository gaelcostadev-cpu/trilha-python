import { describe, expect, it } from 'vitest';
import {
  achievements, canReview, completeActivity, completeReview, confirmDiagnosis, diagnose, examEligibility, hasPassedExam,
  initialProgress, recordExam, reviewActivities, skillEligibility, skills,
} from '../src/domain';

const result = (count: number, hintsUsed = 0) => ({ passed: Array(count).fill(true) as boolean[], hintsUsed });

function finishFirstSkill(hintsUsed = 0) {
  let progress = initialProgress();
  for (const activity of skills[0].activities) {
    progress = completeActivity(progress, skills[0].id, activity.id, result(activity.tests.length));
  }
  return recordExam(progress, skills[0].id, result(skills[0].exam.tests.length, hintsUsed));
}

describe('trilha e avaliação', () => {
  it('tem seis habilidades sequenciais com desafios e casos distintos', () => {
    expect(skills).toHaveLength(6);
    expect(new Set(skills.flatMap((skill) => [...skill.activities, skill.exam].map((challenge) => challenge.id))).size).toBe(18);
    skills.forEach((skill, index) => {
      expect(skill.prerequisite).toBe(index === 0 ? null : skills[index - 1].id);
      expect(skill.activities).toHaveLength(2);
      for (const challenge of [...skill.activities, skill.exam]) {
        expect(challenge.prompt).toBeTruthy();
        expect(challenge.hints.length).toBeGreaterThan(0);
        expect(challenge.tests.length).toBeGreaterThan(0);
      }
    });
  });

  it('bloqueia a próxima habilidade, a prova e a revisão até cumprir os requisitos', () => {
    const progress = initialProgress();
    expect(skillEligibility(progress, 'saida').allowed).toBe(true);
    expect(skillEligibility(progress, 'variaveis').allowed).toBe(false);
    expect(examEligibility(progress, 'saida').allowed).toBe(false);
    expect(canReview(progress, 'saida').allowed).toBe(false);
    expect(() => reviewActivities(progress, 'saida')).toThrow('Revisão bloqueada');
    expect(() => recordExam(progress, 'saida', result(3))).toThrow('Prova bloqueada');
    expect(() => completeActivity(progress, 'variaveis', 'dobro', result(3))).toThrow('Habilidade bloqueada');
  });

  it('conta XP uma vez por atividade e exige resultados completos', () => {
    const start = initialProgress();
    const first = skills[0].activities[0];
    expect(completeActivity(start, 'saida', first.id, { passed: [false], hintsUsed: 0 })).toBe(start);
    const completed = completeActivity(start, 'saida', first.id, result(first.tests.length));
    expect(completed.xp).toBe(20);
    expect(start.completedActivities).toEqual([]);
    expect(completeActivity(completed, 'saida', first.id, result(first.tests.length)).xp).toBe(20);
    expect(() => completeActivity(start, 'saida', first.id, result(0))).toThrow('inválidos');
    expect(() => completeActivity(start, 'saida', first.id, result(1, 2))).toThrow('inválidos');
  });

  it('registra falhas sem aprovação e considera dicas sem premiar tentativas repetidas', () => {
    let progress = initialProgress();
    for (const activity of skills[0].activities) progress = completeActivity(progress, 'saida', activity.id, result(activity.tests.length));
    progress = recordExam(progress, 'saida', { passed: [true, false, true], hintsUsed: 0 });
    expect(hasPassedExam(progress, 'saida')).toBe(false);
    expect(progress.xp).toBe(40);
    progress = recordExam(progress, 'saida', result(3, 1));
    expect(progress.xp).toBe(70);
    expect(progress.exams.saida).toEqual([{ passed: false, hintsUsed: 0 }, { passed: true, hintsUsed: 1 }]);
    expect(skillEligibility(progress, 'variaveis').allowed).toBe(true);
    expect(reviewActivities(progress, 'saida')).toHaveLength(2);
    expect(recordExam(progress, 'saida', result(3)).xp).toBe(70);
    expect(achievements(progress)).toEqual(['Primeiro passo', 'Primeira prova']);
  });

  it('concede conquista sem dicas apenas após uma prova aprovada sem ajuda', () => {
    const progress = finishFirstSkill();
    expect(progress.xp).toBe(100);
    expect(achievements(progress)).toContain('Sem dicas');
  });

  it('usa diagnóstico apenas para recomendar, sem alterar o progresso', () => {
    expect(diagnose({ saida: true, variaveis: false }).skillId).toBe('variaveis');
    expect(diagnose({}).skillId).toBe('saida');
    const progress = initialProgress();
    diagnose(Object.fromEntries(skills.map((skill) => [skill.id, true])));
    expect(progress).toEqual(initialProgress());
  });

  it('mantém o avanço bloqueado após diagnóstico confirmado até toda a revisão passar', () => {
    const progress = finishFirstSkill();
    const blocked = confirmDiagnosis(progress, { saida: false });
    expect(blocked.reviewRequired).toBe('saida');
    expect(canReview(blocked, 'saida').allowed).toBe(true);
    expect(skillEligibility(blocked, 'variaveis').allowed).toBe(false);
    expect(examEligibility(blocked, 'saida').allowed).toBe(false);
    expect(() => completeActivity(blocked, 'variaveis', 'dobro', result(3))).toThrow('bloqueada');
    expect(() => confirmDiagnosis(blocked, { saida: true })).toThrow('pendente');
    expect(() => completeReview(blocked, 'saida', [])).toThrow('incompletos');
    const attempts = skills[0].activities.map((activity) => result(activity.tests.length));
    attempts[0].passed[0] = false;
    expect(completeReview(blocked, 'saida', attempts)).toBe(blocked);
    attempts[0].passed[0] = true;
    const reviewed = completeReview(blocked, 'saida', attempts);
    expect(reviewed.reviewRequired).toBeNull();
    expect(reviewed.xp).toBe(progress.xp);
    expect(skillEligibility(reviewed, 'variaveis').allowed).toBe(true);
  });

  it('não libera prova que exige verificação estrutural não implementada', () => {
    let progress = initialProgress();
    for (const skill of skills.slice(0, -1)) {
      for (const activity of skill.activities) progress = completeActivity(progress, skill.id, activity.id, result(activity.tests.length));
      progress = recordExam(progress, skill.id, result(skill.exam.tests.length));
    }
    for (const activity of skills[5].activities) progress = completeActivity(progress, 'funcoes', activity.id, result(activity.tests.length));
    expect(examEligibility(progress, 'funcoes').allowed).toBe(false);
    expect(examEligibility(progress, 'funcoes').reason).toContain('definição da função');
    expect(() => recordExam(progress, 'funcoes', result(skills[5].exam.tests.length))).toThrow('bloqueada');
  });

});
