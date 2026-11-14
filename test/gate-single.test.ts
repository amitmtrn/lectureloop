// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { AIError, AIErrorCode, InferenceMode, type AI } from 'firebase/ai';
import type * as GradeModule from '../src/grade';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_ANSWER } from '../src/gate-data';
import type { GateCtx } from '../src/gate-ctx';
import { gateFriendlyError } from '../src/gate-errors';
import type { DeviceAvailability, UserChoice } from '../src/routing';

const gradeAnswer = vi.hoisted(() => vi.fn());
vi.mock('../src/grade', async (importOriginal) => ({
  ...(await importOriginal<typeof GradeModule>()),
  gradeAnswer,
}));

const { initSingleGrade } = await import('../src/gate-single');
const { GradeParseError, CloudNotAllowedError } = await import('../src/grade');

interface Opts {
  availability: DeviceAvailability;
  cloud: boolean;
}

function makeCtx(over: Partial<Opts> = {}): GateCtx {
  const o: Opts = { availability: 'available', cloud: false, ...over };
  return {
    fb: o.cloud
      ? ({ kind: 'configured', ai: {} as AI, appCheck: {} } as GateCtx['fb'])
      : { kind: 'local', ai: {} as AI, missing: [] },
    env: () => {
      throw new Error('not used');
    },
    routeInput: (userChoice: UserChoice) => ({
      userChoice,
      deviceAvailability: o.availability,
      adapterAttached: true,
      online: true,
      cloudConfigured: o.cloud,
      appCheckResponsive: o.cloud,
    }),
    onEnv: (fn) => fn(),
  };
}

const result = (verdict: string, source: string | undefined) => ({
  verdict: { verdict, missedPoints: ['Releases oxygen'], confidence: 0.8, reason: 'No oxygen.' },
  source,
  latencyMs: 640,
  attempts: 1,
});

const $id = (id: string) => document.getElementById(id) as HTMLElement;
const grade = () => $id('grade') as HTMLButtonElement;
const settle = () => new Promise((r) => setTimeout(r, 0));
const choose = (value: string) => {
  const input = document.querySelector<HTMLInputElement>(`input[name="route"][value="${value}"]`);
  if (!input) throw new Error('no such route');
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  const html = readFileSync('gate.html', 'utf8');
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  gradeAnswer.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('single grade UI', () => {
  it('asks for an answer and makes no SDK call when the answer is empty (R6.7)', async () => {
    initSingleGrade(makeCtx());
    ($id('answer') as HTMLTextAreaElement).value = '   ';
    grade().click();
    await settle();
    expect(gradeAnswer).not.toHaveBeenCalled();
    expect($id('grade-status').textContent).toBe('Type an answer first.');
  });

  it('shows the blocked reason and makes no SDK call when the plan is blocked (R6.6)', async () => {
    initSingleGrade(makeCtx({ availability: 'downloadable' }));
    expect($id('plan').textContent).toContain('BLOCKED');
    grade().click();
    await settle();
    expect(gradeAnswer).not.toHaveBeenCalled();
    expect($id('grade-result').hidden).toBe(false);
    expect($id('grade-result').textContent).toContain('Prepare Nano');
    expect($id('grade-result').querySelector('.chip-failed')).not.toBeNull();
  });

  it('badges an on-device result teal and grades the typed answer (R6.3, R6.4)', async () => {
    gradeAnswer.mockResolvedValue(result('partial', 'on_device'));
    initSingleGrade(makeCtx());
    ($id('answer') as HTMLTextAreaElement).value = 'My own answer';
    grade().click();
    await vi.waitFor(() => expect($id('grade-status').textContent).toContain('Done in 640 ms'));

    expect(gradeAnswer.mock.calls[0]?.[1]).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(gradeAnswer.mock.calls[0]?.[2].studentAnswer).toBe('My own answer');
    const out = $id('grade-result');
    expect(out.querySelector('.chip-device')?.textContent).toBe('ON-DEVICE');
    expect(out.querySelector('.chip-cloud')).toBeNull();
    expect(out.querySelector('.stamp-partial')?.textContent).toContain('PARTIAL');
    expect(out.textContent).toContain('80%');
    expect(out.textContent).toContain('Releases oxygen');
    expect(out.querySelector('.warning')).toBeNull();
    expect(grade().disabled).toBe(false);
  });

  it('badges a cloud result violet when the cloud route is chosen', async () => {
    gradeAnswer.mockResolvedValue(result('correct', 'in_cloud'));
    initSingleGrade(makeCtx({ cloud: true }));
    choose('cloud');
    expect(grade().className).toContain('btn-cloud');
    grade().click();
    await vi.waitFor(() => expect($id('grade-result').querySelector('.chip-cloud')).not.toBeNull());
    expect(gradeAnswer.mock.calls[0]?.[1]).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect($id('grade-result').querySelector('.warning')).toBeNull();
  });

  it('follows inferenceSource and warns when it differs from the plan (R6.5)', async () => {
    gradeAnswer.mockResolvedValue(result('correct', 'in_cloud'));
    initSingleGrade(makeCtx());
    choose('device');
    grade().click();
    await vi.waitFor(() => expect($id('grade-result').querySelector('.warning')).not.toBeNull());
    expect($id('grade-result').querySelector('.chip-cloud')).not.toBeNull();
    expect($id('grade-result').querySelector('.chip-device')).toBeNull();
    expect($id('grade-result').textContent).toContain('Path mismatch');
  });

  it('shows UNKNOWN, never a guess, when the SDK reports no source', async () => {
    gradeAnswer.mockResolvedValue(result('correct', undefined));
    initSingleGrade(makeCtx());
    grade().click();
    await vi.waitFor(() =>
      expect($id('grade-result').querySelector('.chip-unknown')).not.toBeNull(),
    );
    expect($id('grade-result').querySelector('.chip-device')).toBeNull();
    expect($id('grade-result').querySelector('.warning')).not.toBeNull();
  });

  it('shows a readable error and re-enables Grade when grading fails', async () => {
    gradeAnswer.mockRejectedValue(
      new GradeParseError('Model response did not contain a JSON object.'),
    );
    initSingleGrade(makeCtx());
    grade().click();
    await vi.waitFor(() => expect($id('grade-status').textContent).toBe('Failed.'));
    expect($id('grade-result').textContent).toContain('not in a readable format');
    expect($id('grade-result').textContent).not.toContain('Something went wrong');
    expect($id('grade-result').querySelector('.chip-failed')).not.toBeNull();
    expect(grade().disabled).toBe(false);
  });

  it('keeps the Grade button neutral until the route is known, then teal for on-device', () => {
    initSingleGrade(makeCtx({ availability: 'downloadable' }));
    expect(grade().className).toContain('btn-neutral');
    expect(grade().className).not.toContain('btn-device');
  });

  it('colours the Grade button teal for an on-device plan', () => {
    initSingleGrade(makeCtx());
    expect(grade().className).toContain('btn-device');
  });

  it('keeps SAMPLE_ANSWER as the starting answer', () => {
    initSingleGrade(makeCtx());
    expect(($id('answer') as HTMLTextAreaElement).value).toBe(SAMPLE_ANSWER);
  });
});

describe('gateFriendlyError', () => {
  it('does not point at modes the gate page lacks', () => {
    const f = gateFriendlyError(
      new AIError(AIErrorCode.UNSUPPORTED, 'on-device model is not available'),
      InferenceMode.ONLY_ON_DEVICE,
    );
    expect(f.detail).toContain('What to fix');
    expect(f.detail).not.toContain('Prefer on-device');
    expect(f.detail).not.toContain('as below');
  });

  it('names parse errors and a disabled cloud', () => {
    expect(gateFriendlyError(new GradeParseError('x'), InferenceMode.ONLY_ON_DEVICE).title).toMatch(
      /readable format/,
    );
    expect(
      gateFriendlyError(new CloudNotAllowedError(), InferenceMode.ONLY_IN_CLOUD).title,
    ).toMatch(/cloud is not available/i);
  });

  it('suggests Device only, not "Prefer on-device", on a network error', () => {
    const f = gateFriendlyError(
      new AIError(AIErrorCode.FETCH_ERROR, 'offline'),
      InferenceMode.ONLY_IN_CLOUD,
    );
    expect(f.detail).toContain('Device only');
    expect(f.detail).not.toContain('Prefer on-device');
  });
});
