import type { Verdict } from './grade';

/** Go/no-go thresholds from the concept doc. One object so Remote Config can feed it later. */
export interface GoThresholds {
  /** Warm median latency must be at or below this (ms). */
  maxWarmMedianMs: number;
  /** Share of answers graded as labelled, 0..1. */
  minAgreement: number;
  /** Share of clearly wrong answers not passed as correct, 0..1. */
  minWrongCaught: number;
}

export const GO_THRESHOLDS: GoThresholds = {
  maxWarmMedianMs: 5000,
  minAgreement: 0.7,
  minWrongCaught: 0.9,
};

export type BatchPath = 'on_device' | 'in_cloud' | 'unknown' | 'failed';
export type GateVerdict = 'GO' | 'NO-GO' | 'INCONCLUSIVE';

export interface BatchItem {
  id: string;
  expected: Verdict;
  /** null when the call failed. */
  got: Verdict | null;
  latencyMs: number | null;
  path: BatchPath;
  error?: string;
}

export interface Check {
  id: 'latency' | 'agreement' | 'wrongCaught';
  label: string;
  value: number | null;
  threshold: number;
  pass: boolean;
}

export interface BatchSummary {
  verdict: GateVerdict;
  /** Why the verdict is what it is. */
  explanation: string;
  total: number;
  ranOnDevice: number;
  failed: number;
  warmMedianMs: number | null;
  /** 0..1 */
  agreement: number;
  /** 0..1, null when the set has no clearly wrong answers. */
  wrongCaught: number | null;
  checks: Check[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lo = sorted[mid - 1] ?? 0;
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? hi : (lo + hi) / 2;
}

const EPS = 1e-9;
const atLeast = (value: number, min: number): boolean => value >= min - EPS;

export function summarizeBatch(
  items: readonly BatchItem[],
  thresholds: GoThresholds = GO_THRESHOLDS,
): BatchSummary {
  const total = items.length;
  const onDevice = items.filter((i) => i.path === 'on_device' && i.got !== null);
  const offDevice = items.filter((i) => i.path === 'in_cloud' || i.path === 'unknown');
  const failed = items.filter((i) => i.got === null).length;

  const latencies = onDevice.flatMap((i) => (i.latencyMs === null ? [] : [i.latencyMs]));
  const warmMedianMs = median(latencies);
  const agreement = total === 0 ? 0 : items.filter((i) => i.got === i.expected).length / total;
  const wrong = items.filter((i) => i.expected === 'missed');
  const wrongCaught =
    wrong.length === 0
      ? null
      : wrong.filter((i) => i.got === 'partial' || i.got === 'missed').length / wrong.length;

  const checks: Check[] = [
    {
      id: 'latency',
      label: 'Warm median latency',
      value: warmMedianMs,
      threshold: thresholds.maxWarmMedianMs,
      pass: warmMedianMs !== null && warmMedianMs <= thresholds.maxWarmMedianMs,
    },
    {
      id: 'agreement',
      label: 'Agreement with labels',
      value: agreement,
      threshold: thresholds.minAgreement,
      pass: total > 0 && atLeast(agreement, thresholds.minAgreement),
    },
    {
      id: 'wrongCaught',
      label: 'Clearly wrong answers caught',
      value: wrongCaught,
      threshold: thresholds.minWrongCaught,
      pass: wrongCaught !== null && atLeast(wrongCaught, thresholds.minWrongCaught),
    },
  ];

  let verdict: GateVerdict;
  let explanation: string;
  if (onDevice.length === 0) {
    verdict = 'INCONCLUSIVE';
    explanation = 'Nano did not run on this machine, so there is nothing to judge.';
  } else if (offDevice.length > 0) {
    verdict = 'INCONCLUSIVE';
    explanation = `${offDevice.length} answer(s) did not run on-device, so the result does not measure Nano alone.`;
  } else if (checks.every((c) => c.pass)) {
    verdict = 'GO';
    explanation = 'All three thresholds passed, all on-device.';
  } else {
    verdict = 'NO-GO';
    explanation = `Failed: ${checks
      .filter((c) => !c.pass)
      .map((c) => c.label.toLowerCase())
      .join(', ')}.`;
  }

  return {
    verdict,
    explanation,
    total,
    ranOnDevice: onDevice.length,
    failed,
    warmMedianMs,
    agreement,
    wrongCaught,
    checks,
  };
}

export interface GateReport {
  generatedAt: string;
  environment: Record<string, string>;
  thresholds: GoThresholds;
  /** Latency of the warm-up call, reported separately. */
  coldLatencyMs: number | null;
  summary: BatchSummary;
  items: (BatchItem & { answer: string })[];
}

export function toJson(report: GateReport): string {
  return JSON.stringify(report, null, 2);
}

export const pct = (v: number | null): string => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);
export const ms = (v: number | null): string => (v === null ? 'n/a' : `${Math.round(v)} ms`);

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ');

export function toMarkdown(report: GateReport): string {
  const s = report.summary;
  const lines = [
    `# Nano go/no-go: ${s.verdict}`,
    '',
    s.explanation,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment',
    ...Object.entries(report.environment).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Summary',
    `- Cold latency (warm-up call): ${ms(report.coldLatencyMs)}`,
    `- Warm median latency: ${ms(s.warmMedianMs)} (limit ${ms(report.thresholds.maxWarmMedianMs)})`,
    `- Agreement: ${pct(s.agreement)} (min ${pct(report.thresholds.minAgreement)})`,
    `- Clearly wrong caught: ${pct(s.wrongCaught)} (min ${pct(report.thresholds.minWrongCaught)})`,
    '',
    '## Answers',
    '| Answer | Expected | Got | Latency | Path |',
    '| --- | --- | --- | --- | --- |',
    ...report.items.map(
      (i) =>
        `| ${cell(i.id)} | ${i.expected} | ${i.got ?? 'failed'} | ${ms(i.latencyMs)} | ${i.path} |`,
    ),
    '',
  ];
  return lines.join('\n');
}
