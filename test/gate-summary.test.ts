import { describe, expect, it } from 'vitest';
import { GATE_CARDS, LABELLED_SET, toGradeInput } from '../src/gate-data';
import {
  GO_THRESHOLDS,
  median,
  summarizeBatch,
  toJson,
  toMarkdown,
  type BatchItem,
  type GateReport,
} from '../src/gate-summary';
import type { Verdict } from '../src/grade';

function item(
  expected: Verdict,
  got: Verdict | null,
  latencyMs: number | null = 1000,
  path: BatchItem['path'] = 'on_device',
): BatchItem {
  return { id: `${expected}-${got}-${latencyMs}`, expected, got, latencyMs, path };
}

/** 10 items: 7 labelled correct/partial and 3 clearly wrong; all graded as labelled. */
function perfect(latency = 1000): BatchItem[] {
  return [
    ...Array.from({ length: 4 }, () => item('correct', 'correct', latency)),
    ...Array.from({ length: 3 }, () => item('partial', 'partial', latency)),
    ...Array.from({ length: 3 }, () => item('missed', 'missed', latency)),
  ];
}

describe('median', () => {
  it('handles empty, odd, even and unsorted input', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([7])).toBe(7);
  });
});

describe('summarizeBatch', () => {
  it('uses the concept-doc thresholds', () => {
    expect(GO_THRESHOLDS).toEqual({
      maxWarmMedianMs: 5000,
      minAgreement: 0.7,
      minWrongCaught: 0.9,
    });
  });

  it('is GO when everything passes on-device', () => {
    const s = summarizeBatch(perfect());
    expect(s).toMatchObject({
      verdict: 'GO',
      warmMedianMs: 1000,
      agreement: 1,
      wrongCaught: 1,
      ranOnDevice: 10,
      failed: 0,
    });
  });

  it('latency edge: 5000 ms passes, 5001 ms fails', () => {
    expect(summarizeBatch(perfect(5000)).verdict).toBe('GO');
    const slow = summarizeBatch(perfect(5001));
    expect(slow.verdict).toBe('NO-GO');
    expect(slow.explanation).toMatch(/latency/);
  });

  it('agreement edge: 70% passes, 60% fails', () => {
    // 3 of 10 labelled-correct answers disagree -> 70%.
    const seventy = perfect().map((i, idx) => (idx < 3 ? { ...i, got: 'partial' as Verdict } : i));
    expect(summarizeBatch(seventy)).toMatchObject({ agreement: 0.7, verdict: 'GO' });
    const sixty = perfect().map((i, idx) => (idx < 4 ? { ...i, got: 'partial' as Verdict } : i));
    expect(summarizeBatch(sixty)).toMatchObject({ agreement: 0.6, verdict: 'NO-GO' });
  });

  it('wrong-caught edge: 9/10 passes, 8/10 fails; partial counts as caught', () => {
    const wrong = (got: Verdict): BatchItem[] =>
      Array.from({ length: 10 }, (_v, i) => item('missed', i === 0 ? 'correct' : got));
    const nine = summarizeBatch([...wrong('missed'), ...perfect().slice(0, 7)]);
    expect(nine.wrongCaught).toBe(0.9);
    expect(nine.checks.find((c) => c.id === 'wrongCaught')?.pass).toBe(true);

    const eight = [
      ...Array.from({ length: 10 }, (_v, i) => item('missed', i < 2 ? 'correct' : 'partial')),
      ...perfect().slice(0, 7),
    ];
    const s = summarizeBatch(eight);
    expect(s.wrongCaught).toBe(0.8);
    expect(s.verdict).toBe('NO-GO');
  });

  it('counts failures as disagreement and not caught, without latency', () => {
    const items = [...perfect(), item('missed', null, null, 'failed')];
    const s = summarizeBatch(items);
    expect(s.failed).toBe(1);
    expect(s.ranOnDevice).toBe(10);
    expect(s.agreement).toBeCloseTo(10 / 11);
    expect(s.wrongCaught).toBe(0.75);
    expect(s.warmMedianMs).toBe(1000);
    expect(s.verdict).toBe('NO-GO');
  });

  it('is INCONCLUSIVE when nothing ran on-device', () => {
    expect(summarizeBatch([]).verdict).toBe('INCONCLUSIVE');
    const allFailed = Array.from({ length: 4 }, () => item('correct', null, null, 'failed'));
    expect(summarizeBatch(allFailed).verdict).toBe('INCONCLUSIVE');
  });

  it('is INCONCLUSIVE when any answer ran off-device or unreported', () => {
    expect(
      summarizeBatch([...perfect(), item('correct', 'correct', 900, 'in_cloud')]).verdict,
    ).toBe('INCONCLUSIVE');
    expect(summarizeBatch([...perfect(), item('correct', 'correct', 900, 'unknown')]).verdict).toBe(
      'INCONCLUSIVE',
    );
  });

  it('accepts overridden thresholds', () => {
    const s = summarizeBatch(perfect(3000), { ...GO_THRESHOLDS, maxWarmMedianMs: 2000 });
    expect(s.verdict).toBe('NO-GO');
  });

  it('cannot be GO without clearly wrong answers to measure', () => {
    const s = summarizeBatch([item('correct', 'correct')]);
    expect(s.wrongCaught).toBeNull();
    expect(s.verdict).toBe('NO-GO');
  });
});

describe('report output', () => {
  const items = LABELLED_SET.slice(0, 2).map((a) => ({
    ...item(a.expected, a.expected),
    id: a.id,
    answer: a.answer,
  }));
  const report: GateReport = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    environment: { Chrome: '139' },
    thresholds: GO_THRESHOLDS,
    coldLatencyMs: 9000,
    summary: summarizeBatch(items),
    items,
  };

  it('serializes to JSON that round-trips', () => {
    expect(JSON.parse(toJson(report)).summary.verdict).toBe(report.summary.verdict);
  });

  it('renders Markdown with the verdict, cold latency and a row per answer', () => {
    const md = toMarkdown(report);
    expect(md).toContain('# Nano go/no-go:');
    expect(md).toContain('Cold latency (warm-up call): 9000 ms');
    expect(md).toContain('| photo-correct | correct | correct | 1000 ms | on_device |');
  });
});

describe('labelled set', () => {
  it('has 12 answers over 4 cards with a correct, partial and wrong answer each', () => {
    expect(LABELLED_SET).toHaveLength(12);
    expect(GATE_CARDS).toHaveLength(4);
    for (const card of GATE_CARDS) {
      const expected = LABELLED_SET.filter((a) => a.cardId === card.id).map((a) => a.expected);
      expect(expected.sort()).toEqual(['correct', 'missed', 'partial']);
    }
    expect(new Set(LABELLED_SET.map((a) => a.id)).size).toBe(12);
  });

  it('builds grade inputs from the card', () => {
    const input = toGradeInput(LABELLED_SET[0]!);
    expect(input.keyPoints.length).toBeGreaterThan(1);
    expect(input.studentAnswer).toBe(LABELLED_SET[0]!.answer);
  });
});
