import { describe, expect, it } from 'vitest';
import {
  describeAvailability,
  describeBrowser,
  environmentFixes,
  parseBrowser,
  type EnvSnapshot,
} from '../src/gate-env';

const UA_CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const good: EnvSnapshot = {
  browser: { name: 'Chrome', major: 141, isMobile: false },
  languageModelExists: true,
  availability: 'available',
  adapterAttached: true,
  online: true,
  configured: true,
  missingConfig: [],
  appCheck: 'responding',
};
const ids = (over: Partial<EnvSnapshot>) => environmentFixes({ ...good, ...over }).map((f) => f.id);

describe('parseBrowser', () => {
  it('prefers userAgentData brands', () => {
    expect(
      parseBrowser(UA_CHROME, [
        { brand: 'Not.A/Brand', version: '99' },
        { brand: 'Chromium', version: '141' },
        { brand: 'Google Chrome', version: '141' },
      ]),
    ).toEqual({ name: 'Chrome', major: 141, isMobile: false });
  });

  it('falls back to the UA string', () => {
    expect(parseBrowser(UA_CHROME)).toEqual({ name: 'Chrome', major: 141, isMobile: false });
  });

  it('recognises Edge, Firefox, Safari and mobile', () => {
    expect(parseBrowser(`${UA_CHROME} Edg/140.0.0.0`).name).toBe('Microsoft Edge');
    expect(parseBrowser('Mozilla/5.0 Gecko/20100101 Firefox/130.0')).toMatchObject({
      name: 'Firefox',
      major: 130,
    });
    expect(
      parseBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15'),
    ).toMatchObject({ name: 'Safari', major: 17 });
    expect(
      parseBrowser(`${UA_CHROME.replace('X11; Linux x86_64', 'Linux; Android 14')} Mobile`)
        .isMobile,
    ).toBe(true);
    expect(parseBrowser('curl/8')).toEqual({
      name: 'Unknown browser',
      major: null,
      isMobile: false,
    });
  });

  it('describes browsers and availability', () => {
    expect(describeBrowser({ name: 'Chrome', major: 141, isMobile: false })).toBe('Chrome 141');
    expect(describeAvailability('api-missing')).toBe('API missing');
    expect(describeAvailability('downloadable')).toBe('downloadable');
  });
});

describe('environmentFixes', () => {
  it('needs no fixes when everything works', () => {
    expect(ids({})).toEqual([]);
  });

  it('asks for Chrome 139+ on old, non-Chrome and mobile browsers', () => {
    expect(ids({ browser: { name: 'Chrome', major: 138, isMobile: false } })).toContain('version');
    expect(ids({ browser: { name: 'Firefox', major: 130, isMobile: false } })).toContain('browser');
    expect(ids({ browser: { name: 'Chrome', major: 141, isMobile: true } })).toContain('desktop');
  });

  it('gives the exact flag when LanguageModel is missing', () => {
    const fixes = environmentFixes({
      ...good,
      languageModelExists: false,
      availability: 'api-missing',
      adapterAttached: false,
    });
    expect(fixes.map((f) => f.id)).toEqual(['flag']);
    expect(fixes[0]?.text).toContain('chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
    expect(fixes[0]?.text).toMatch(/relaunch/i);
  });

  it('lists hardware needs when unavailable', () => {
    const text = environmentFixes({ ...good, availability: 'unavailable' })[0]?.text ?? '';
    expect(text).toMatch(/22 GB/);
    expect(text).toMatch(/16 GB RAM/);
    expect(text).toMatch(/4 GB of GPU VRAM/);
    expect(text).toContain('chrome://on-device-internals');
  });

  it('points to Prepare Nano when downloadable, and to waiting when downloading', () => {
    expect(environmentFixes({ ...good, availability: 'downloadable' })[0]?.text).toMatch(
      /Prepare Nano/,
    );
    expect(ids({ availability: 'downloading' })).toEqual(['downloading']);
  });

  it('reports a missing adapter', () => {
    expect(ids({ adapterAttached: false })).toEqual(['adapter']);
  });

  it('explains offline, missing config and stuck App Check', () => {
    expect(ids({ online: false })).toEqual(['offline']);
    const cfg = environmentFixes({
      ...good,
      configured: false,
      missingConfig: ['VITE_FIREBASE_API_KEY'],
      appCheck: 'not-configured',
    });
    expect(cfg[0]?.text).toContain('VITE_FIREBASE_API_KEY');
    expect(cfg[0]?.text).toContain('docs/SETUP-FIREBASE.md');
    expect(ids({ appCheck: 'stuck' })).toEqual(['appcheck']);
    expect(ids({ appCheck: 'error' })).toEqual(['appcheck-init']);
  });
});
