import { describe, expect, it } from 'vitest';
import { appCheckDebugToken, readConfig, REQUIRED_ENV_VARS } from '../src/config';

const full = {
  VITE_FIREBASE_API_KEY: 'test-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: 'site-key',
};

describe('readConfig', () => {
  it('reports every required var when env is empty', () => {
    expect(readConfig({})).toEqual({ ok: false, missing: [...REQUIRED_ENV_VARS] });
  });

  it('treats blank and .env.example placeholder values as missing', () => {
    const result = readConfig({
      ...full,
      VITE_FIREBASE_API_KEY: '   ',
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: 'your-recaptcha-enterprise-site-key',
    });
    expect(result).toEqual({
      ok: false,
      missing: ['VITE_FIREBASE_API_KEY', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'],
    });
  });

  it('builds Firebase options when complete', () => {
    const result = readConfig(full);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firebaseOptions.projectId).toBe('demo');
    expect(result.firebaseOptions.appId).toBe('1:123:web:abc');
    expect(result.recaptchaSiteKey).toBe('site-key');
  });
});

describe('appCheckDebugToken', () => {
  it('is never set outside dev', () => {
    expect(appCheckDebugToken(false, 'some-token')).toBeUndefined();
    expect(appCheckDebugToken(false, undefined)).toBeUndefined();
  });
  it('uses the env token in dev, or true to let the SDK generate one', () => {
    expect(appCheckDebugToken(true, ' tok ')).toBe('tok');
    expect(appCheckDebugToken(true, '')).toBe(true);
    expect(appCheckDebugToken(true, undefined)).toBe(true);
  });
});
