import { InferenceMode } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
import { gateFriendlyError } from '../src/gate-errors';
import { GradeParseError } from '../src/grade';

describe('gateFriendlyError', () => {
  it('uses wording that fits both Grade and the batch for parse errors', () => {
    const f = gateFriendlyError(new GradeParseError('bad json'), InferenceMode.ONLY_ON_DEVICE);
    expect(f.detail).toContain('Run it again.');
    expect(f.detail).not.toContain('Press Grade');
  });
});
