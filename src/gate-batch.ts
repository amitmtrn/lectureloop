import type { GateCtx } from './gate-ctx';
import { LABELLED_SET, toGradeInput } from './gate-data';
import { $, el, pathBadge, type PathLabel } from './gate-dom';
import {
  describeAppCheck,
  describeAvailability,
  describeBrowser,
  describeFirebaseConfig,
} from './gate-env';
import { gateFriendlyError } from './gate-errors';
import { allowsCloud } from './gate-firebase';
import {
  GO_THRESHOLDS,
  ms,
  pct,
  summarizeBatch,
  toJson,
  toMarkdown,
  type BatchItem,
  type BatchSummary,
  type GateReport,
} from './gate-summary';
import { GradeTimeoutError, gradeAnswer, WARMUP_TIMEOUT_MS } from './grade';
import { classifyPath, planRoute } from './routing';

const VERDICT_CLASS = {
  GO: 'verdict-go',
  'NO-GO': 'verdict-nogo',
  INCONCLUSIVE: 'verdict-inconclusive',
} as const;
const VERDICT_ICON = { GO: '✓', 'NO-GO': '✕', INCONCLUSIVE: '?' } as const;

export function initBatch(ctx: GateCtx): void {
  const els = {
    run: $<HTMLButtonElement>('run-batch'),
    status: $('batch-status'),
    progress: $('batch-progress'),
    fill: $('batch-fill'),
    out: $('batch-out'),
    verdict: $('verdict'),
    tableWrap: $('batch-table'),
    metrics: $('metrics'),
    rows: $<HTMLTableSectionElement>('batch-rows'),
    copyJson: $<HTMLButtonElement>('copy-json'),
    copyMd: $<HTMLButtonElement>('copy-md'),
    copyStatus: $('copy-status'),
  };
  let report: GateReport | null = null;

  function setProgress(done: number): void {
    els.progress.hidden = false;
    els.progress.setAttribute('aria-valuenow', String(done));
    els.fill.style.width = `${(done / LABELLED_SET.length) * 100}%`;
  }

  function renderVerdict(summary: BatchSummary, extra?: string): void {
    // Update the existing live region in place: a freshly inserted one is often not announced.
    els.verdict.className = `verdict ${VERDICT_CLASS[summary.verdict]}`;
    els.verdict.replaceChildren(
      el('span', 'word', `${VERDICT_ICON[summary.verdict]} ${summary.verdict}`),
      el('p', undefined, extra ?? summary.explanation),
    );
  }

  /** Drops the rows of items that never ran, and the whole table if none did. */
  function trimRows(graded: number): void {
    while (els.rows.children.length > graded) els.rows.lastElementChild?.remove();
    els.tableWrap.hidden = graded === 0;
  }

  function tile(big: string, cap: string, rule?: { text: string; pass: boolean }): HTMLElement {
    const t = el('div', 'tile');
    t.append(el('span', 'big', big), el('span', 'cap', cap));
    if (rule) t.append(el('span', `rule ${rule.pass ? 'pass' : 'fail'}`, rule.text));
    return t;
  }

  function renderMetrics(summary: BatchSummary, cold: number | null): void {
    const [lat, agr, wrong] = summary.checks;
    els.metrics.replaceChildren(
      tile(ms(cold), 'cold latency (warm-up call)'),
      tile(ms(summary.warmMedianMs), 'warm median latency', {
        text: `limit ${ms(GO_THRESHOLDS.maxWarmMedianMs)}`,
        pass: lat?.pass ?? false,
      }),
      tile(pct(summary.agreement), 'agreement with labels', {
        text: `min ${pct(GO_THRESHOLDS.minAgreement)}`,
        pass: agr?.pass ?? false,
      }),
      tile(pct(summary.wrongCaught), 'clearly wrong answers caught', {
        text: `min ${pct(GO_THRESHOLDS.minWrongCaught)}`,
        pass: wrong?.pass ?? false,
      }),
    );
  }

  function renderRow(item: BatchItem | null, index: number): HTMLTableRowElement {
    const spec = LABELLED_SET[index];
    const tr = el('tr');
    tr.append(el('td', undefined, spec?.id ?? ''), el('td', undefined, spec?.expected ?? ''));
    if (!item) {
      tr.append(el('td', 'v-wait', 'waiting…'), el('td', 'num', ''), el('td'));
      return tr;
    }
    const got = item.got ?? 'failed';
    if (item.got !== item.expected) tr.className = 'disagree';
    const gotCell = el('td', `v-${got}`, got);
    if (item.error) gotCell.title = item.error;
    const path = el('td');
    path.append(pathBadge(item.path as PathLabel));
    tr.append(gotCell, el('td', 'num', ms(item.latencyMs)), path);
    return tr;
  }

  function environmentRecord(): Record<string, string> {
    const e = ctx.env();
    return {
      Browser: describeBrowser(e.browser),
      'LanguageModel API': e.languageModelExists ? 'present' : 'missing',
      'Availability (text, English)': describeAvailability(e.availability),
      'Firebase on-device adapter': e.adapterAttached ? 'attached' : 'not attached',
      Online: e.online ? 'yes' : 'no',
      'Firebase config': describeFirebaseConfig(e),
      'App Check': describeAppCheck(e.appCheck),
    };
  }

  // Run is also disabled while a single grade holds the shared lock.
  ctx.inference.onChange(() => {
    els.run.disabled = ctx.inference.busy();
  });

  async function run(): Promise<void> {
    if (ctx.inference.busy()) return;
    const plan = planRoute(ctx.routeInput('device'));
    els.out.hidden = false;
    els.verdict.className = 'verdict';
    els.verdict.replaceChildren();
    els.metrics.replaceChildren();
    report = null;
    els.copyJson.disabled = els.copyMd.disabled = true;
    els.copyStatus.textContent = '';

    let graded = 0;
    const inconclusive = (why: string): void => {
      trimRows(graded);
      renderVerdict(summarizeBatch([]), why);
      els.status.textContent = 'Stopped.';
      els.verdict.focus();
    };
    if (plan.mode === null) {
      els.progress.hidden = true;
      inconclusive(plan.reason);
      return;
    }
    const mode = plan.mode;
    const opts = { allowCloud: allowsCloud(ctx.fb) };

    const release = ctx.inference.tryAcquire();
    if (!release) return;
    els.tableWrap.hidden = false;
    els.rows.replaceChildren(...LABELLED_SET.map((_a, i) => renderRow(null, i)));
    setProgress(0);
    try {
      const first = LABELLED_SET[0];
      if (!first) return;
      els.status.textContent = 'Warm-up call (loads the model, can take a while)…';
      let cold: number;
      try {
        const warm = await gradeAnswer(ctx.fb.ai, mode, toGradeInput(first), {
          ...opts,
          timeoutMs: WARMUP_TIMEOUT_MS,
        });
        const check = classifyPath(plan.expectedPath, warm.source);
        if (check.mismatch) throw new Error(check.message);
        cold = warm.latencyMs;
      } catch (err) {
        console.error('[LectureLoop] warm-up failed', err);
        const f = gateFriendlyError(err, mode);
        inconclusive(`Warm-up failed, so Nano did not run. ${f.title}. ${f.detail}`);
        return;
      }

      const items: BatchItem[] = [];
      let timedOut: GradeTimeoutError | null = null;
      for (const [i, spec] of LABELLED_SET.entries()) {
        els.status.textContent = `Grading ${i + 1} of ${LABELLED_SET.length}…`;
        let item: BatchItem;
        try {
          const res = await gradeAnswer(ctx.fb.ai, mode, toGradeInput(spec), opts);
          const check = classifyPath(plan.expectedPath, res.source);
          item = {
            id: spec.id,
            expected: spec.expected,
            got: res.verdict.verdict,
            latencyMs: res.latencyMs,
            path: check.actual,
          };
        } catch (err) {
          console.warn('[LectureLoop] grading failed', spec.id, err);
          if (err instanceof GradeTimeoutError) {
            timedOut = err;
            break;
          }
          item = {
            id: spec.id,
            expected: spec.expected,
            got: null,
            latencyMs: null,
            path: 'failed',
            error: err instanceof Error ? err.message : String(err),
          };
        }
        items.push(item);
        graded = items.length;
        els.rows.children[i]?.replaceWith(renderRow(item, i));
        setProgress(i + 1);
      }

      if (timedOut) {
        const f = gateFriendlyError(timedOut, mode);
        inconclusive(
          `Stopped at answer ${graded + 1} of ${LABELLED_SET.length}. ${f.title}. ${f.detail}`,
        );
        return;
      }

      const summary = summarizeBatch(items);
      renderVerdict(summary);
      renderMetrics(summary, cold);
      report = {
        generatedAt: new Date().toISOString(),
        environment: environmentRecord(),
        thresholds: GO_THRESHOLDS,
        coldLatencyMs: cold,
        summary,
        items: items.map((it, i) => ({ ...it, answer: LABELLED_SET[i]?.answer ?? '' })),
      };
      els.copyJson.disabled = els.copyMd.disabled = false;
      els.status.textContent = `Done: ${summary.verdict}.`;
      els.verdict.focus();
    } finally {
      els.progress.hidden = true;
      release();
    }
  }

  async function copy(text: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      els.copyStatus.textContent = `${what} copied.`;
    } catch {
      const area = el('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      els.copyStatus.textContent = ok
        ? `${what} copied.`
        : 'Copy failed. Select the table instead.';
    }
  }

  els.run.addEventListener('click', () => void run());
  els.copyJson.addEventListener('click', () => report && void copy(toJson(report), 'JSON'));
  els.copyMd.addEventListener('click', () => report && void copy(toMarkdown(report), 'Markdown'));
  els.copyJson.disabled = els.copyMd.disabled = true;
}
