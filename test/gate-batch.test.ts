// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { InferenceMode, type AI } from 'firebase/ai';
import type * as GradeModule from '../src/grade';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GateCtx } from '../src/gate-ctx';
import type { EnvSnapshot } from '../src/gate-env';
import { LABELLED_SET } from '../src/gate-data';
import { planRoute, type UserChoice } from '../src/routing';

const gradeAnswer = vi.hoisted(() => vi.fn());
vi.mock('../src/grade', async (importOriginal) => ({
  ...(await importOriginal<typeof GradeModule>()),
  gradeAnswer,
}));

const { initBatch } = await import('../src/gate-batch');

const env: EnvSnapshot = {
  browser: { name: 'Chrome', major: 141, isMobile: false },
  languageModelExists: true,
  availability: 'available',
  adapterAttached: true,
  online: true,
  configured: false,
  missingConfig: [],
  appCheck: 'not-configured',
};

function makeCtx(over: Partial<EnvSnapshot> = {}): GateCtx {
  const e = { ...env, ...over };
  return {
    fb: { kind: 'local', ai: {} as AI, missing: [] },
    env: () => e,
    routeInput: (userChoice: UserChoice) => ({
      userChoice,
      deviceAvailability: e.availability,
      adapterAttached: e.adapterAttached,
      online: e.online,
      cloudConfigured: e.configured,
      appCheckResponsive: false,
    }),
    onEnv: (fn) => fn(),
  };
}

const grade = (verdict: string, source: string | undefined = 'on_device', latencyMs = 800) => ({
  verdict: { verdict, missedPoints: [], confidence: 0.9, reason: 'r' },
  source,
  latencyMs,
  attempts: 1,
});

const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  const html = readFileSync('gate.html', 'utf8');
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  gradeAnswer.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('batch go/no-go UI', () => {
  it('warms up first, grades all 12 with the labelled verdicts and shows GO', async () => {
    gradeAnswer.mockImplementation(async (_ai, _mode, input) => {
      const spec = LABELLED_SET.find((a) => a.answer === input.studentAnswer);
      return grade(spec?.expected ?? 'correct', 'on_device', spec ? 900 : 4000);
    });
    initBatch(makeCtx());
    click('run-batch');
    await vi.waitFor(() =>
      expect(document.getElementById('copy-json')).toHaveProperty('disabled', false),
    );

    expect(gradeAnswer).toHaveBeenCalledTimes(13); // 1 warm-up + 12
    expect(gradeAnswer.mock.calls[0]?.[1]).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(document.getElementById('verdict')?.textContent).toContain('GO');
    expect(document.querySelectorAll('#batch-rows tr')).toHaveLength(12);
    expect(document.querySelector('#batch-rows .chip-device')).not.toBeNull();
    expect(document.getElementById('metrics')?.textContent).toContain('cold latency');
  });

  it('shows NO-GO when Nano disagrees too often', async () => {
    gradeAnswer.mockResolvedValue(grade('correct'));
    initBatch(makeCtx());
    click('run-batch');
    await vi.waitFor(() =>
      expect(document.getElementById('verdict')?.textContent).toMatch(/NO-GO/),
    );
  });

  it('shows INCONCLUSIVE and stops when the warm-up fails', async () => {
    gradeAnswer.mockRejectedValue(new Error('Local LanguageModel API not available'));
    initBatch(makeCtx());
    click('run-batch');
    await vi.waitFor(() =>
      expect(document.getElementById('verdict')?.textContent).toContain('INCONCLUSIVE'),
    );
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
  });

  it('shows INCONCLUSIVE without calling the SDK when the plan is blocked', async () => {
    initBatch(makeCtx({ availability: 'downloadable' }));
    click('run-batch');
    await settle();
    expect(gradeAnswer).not.toHaveBeenCalled();
    expect(document.getElementById('verdict')?.textContent).toMatch(
      /INCONCLUSIVE[\s\S]*Prepare Nano/,
    );
  });

  it('marks an item that ran in the cloud and ends INCONCLUSIVE', async () => {
    gradeAnswer
      .mockResolvedValueOnce(grade('correct'))
      .mockResolvedValue(grade('correct', 'in_cloud'));
    initBatch(makeCtx());
    click('run-batch');
    await vi.waitFor(() =>
      expect(document.getElementById('copy-md')).toHaveProperty('disabled', false),
    );
    expect(document.querySelector('#batch-rows .chip-cloud')).not.toBeNull();
    expect(document.getElementById('verdict')?.textContent).toContain('INCONCLUSIVE');
  });

  it('copies JSON and Markdown to the clipboard', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    gradeAnswer.mockResolvedValue(grade('correct'));
    initBatch(makeCtx());
    click('run-batch');
    await vi.waitFor(() =>
      expect(document.getElementById('copy-json')).toHaveProperty('disabled', false),
    );
    click('copy-json');
    click('copy-md');
    await settle();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string).items).toHaveLength(12);
    expect(writeText.mock.calls[1]?.[0]).toContain('# Nano go/no-go');
    vi.unstubAllGlobals();
  });

  it('plan for a device-only run matches the routing module', () => {
    expect(planRoute(makeCtx().routeInput('device')).mode).toBe(InferenceMode.ONLY_ON_DEVICE);
  });
});
