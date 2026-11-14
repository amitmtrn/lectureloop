import { InferenceMode } from 'firebase/ai';
import { $, el, pathBadge, setChildren, verdictStamp, type PathLabel } from './gate-dom';
import type { GateCtx } from './gate-ctx';
import { gateFriendlyError } from './gate-errors';
import { allowsCloud } from './gate-firebase';
import { SAMPLE_ANSWER, SAMPLE_CARD } from './gate-data';
import { gradeAnswer, type GradeResult } from './grade';
import { classifyPath, planRoute, type UserChoice } from './routing';

export function initSingleGrade(ctx: GateCtx): void {
  const els = {
    q: $('card-q'),
    ref: $('card-ref'),
    points: $<HTMLUListElement>('card-points'),
    choices: $('choices'),
    plan: $('plan'),
    answer: $<HTMLTextAreaElement>('answer'),
    grade: $<HTMLButtonElement>('grade'),
    status: $('grade-status'),
    result: $('grade-result'),
  };

  els.q.textContent = SAMPLE_CARD.question;
  els.ref.textContent = SAMPLE_CARD.referenceAnswer;
  els.points.replaceChildren(...SAMPLE_CARD.keyPoints.map((p) => el('li', undefined, p)));
  els.answer.value = SAMPLE_ANSWER;

  const choice = (): UserChoice => {
    const checked = els.choices.querySelector<HTMLInputElement>('input[name="route"]:checked');
    const v = checked?.value;
    return v === 'device' || v === 'cloud' ? v : 'auto';
  };

  function renderPlan(): void {
    const plan = planRoute(ctx.routeInput(choice()));
    const badge =
      plan.expectedPath === 'none'
        ? el('span', 'chip chip-unknown', 'BLOCKED')
        : pathBadge(plan.expectedPath);
    setChildren(els.plan, [badge, plan.reason]);
    // Teal and violet mean "runs on-device / in the cloud": colour the button only once that is known.
    els.grade.className = `btn ${
      plan.expectedPath === 'on_device'
        ? 'btn-device'
        : plan.expectedPath === 'in_cloud'
          ? 'btn-cloud'
          : 'btn-neutral'
    }`;
  }
  ctx.onEnv(renderPlan);
  els.choices.addEventListener('change', renderPlan);

  function showBlocked(reason: string): void {
    els.result.className = 'result is-failed';
    els.result.replaceChildren(pathBadge('failed'), el('p', 'blocked', reason));
    els.result.hidden = false;
    els.result.focus();
  }

  function showResult(
    res: GradeResult,
    expected: ReturnType<typeof planRoute>['expectedPath'],
  ): void {
    const check = classifyPath(expected, res.source);
    const path: PathLabel = check.actual;
    const v = res.verdict;
    els.result.className = `result ${path === 'on_device' ? 'is-device' : path === 'in_cloud' ? 'is-cloud' : ''}`;

    const head = el('div', 'result-head');
    head.append(verdictStamp(v.verdict), pathBadge(path));

    const metrics = el('div', 'metrics');
    const metric = (big: string, cap: string): HTMLElement => {
      const m = el('div', 'metric');
      m.append(el('span', 'big', big), el('span', 'cap', cap));
      return m;
    };
    metrics.append(
      metric(`${res.latencyMs} ms`, 'latency'),
      metric(`${Math.round(v.confidence * 100)}%`, 'confidence'),
    );

    const children: Node[] = [head, metrics];
    if (v.missedPoints.length > 0) {
      children.push(el('h3', undefined, 'Missed points'));
      const ul = el('ul');
      ul.append(...v.missedPoints.map((p) => el('li', undefined, p)));
      children.push(ul);
    }
    children.push(el('h3', undefined, 'Reason'), el('p', undefined, v.reason || '(none given)'));
    if (check.mismatch) children.push(el('p', 'warning', `Path mismatch: ${check.message}`));
    els.result.replaceChildren(...children);
    els.result.hidden = false;
  }

  // Grade is also disabled while the go/no-go batch holds the shared lock.
  ctx.inference.onChange(() => {
    els.grade.disabled = ctx.inference.busy();
  });
  els.grade.addEventListener('click', () => {
    void onGrade();
  });

  async function onGrade(): Promise<void> {
    if (ctx.inference.busy()) return;
    const studentAnswer = els.answer.value.trim();
    if (!studentAnswer) {
      els.status.textContent = 'Type an answer first.';
      els.answer.focus();
      return;
    }
    const plan = planRoute(ctx.routeInput(choice()));
    if (plan.mode === null) {
      els.status.textContent = 'Nothing to run.';
      showBlocked(plan.reason);
      return;
    }

    const release = ctx.inference.tryAcquire();
    if (!release) return;
    els.status.textContent = 'Grading…';
    try {
      const res = await gradeAnswer(
        ctx.fb.ai,
        plan.mode,
        {
          question: SAMPLE_CARD.question,
          referenceAnswer: SAMPLE_CARD.referenceAnswer,
          keyPoints: SAMPLE_CARD.keyPoints,
          studentAnswer,
        },
        { allowCloud: allowsCloud(ctx.fb) },
      );
      showResult(res, plan.expectedPath);
      els.status.textContent = `Done in ${res.latencyMs} ms.`;
      els.result.focus();
    } catch (err) {
      console.error('[LectureLoop] grade failed', err);
      const friendly = gateFriendlyError(err, plan.mode ?? InferenceMode.ONLY_ON_DEVICE);
      showBlocked(`${friendly.title}. ${friendly.detail}`);
      els.status.textContent = 'Failed.';
    } finally {
      release();
    }
  }
}
