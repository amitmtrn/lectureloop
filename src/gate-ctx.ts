import type { GateFirebase } from './gate-firebase';
import type { EnvSnapshot } from './gate-env';
import type { RouteInput, UserChoice } from './routing';

/**
 * One on-device call at a time across the page. The SDK destroys the previous session when a
 * new one is created on the same adapter, so overlapping calls abort each other and skew timing.
 */
export interface InferenceLock {
  /** Returns a release function, or null when another call holds the lock. */
  tryAcquire: () => (() => void) | null;
  busy: () => boolean;
  /** Calls `fn` whenever the lock is taken or released. */
  onChange: (fn: () => void) => void;
}

export function createInferenceLock(): InferenceLock {
  let held = false;
  const listeners: Array<() => void> = [];
  const notify = (): void => listeners.forEach((fn) => fn());
  return {
    tryAcquire: () => {
      if (held) return null;
      held = true;
      notify();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held = false;
        notify();
      };
    },
    busy: () => held,
    onChange: (fn) => {
      listeners.push(fn);
    },
  };
}

/** What the gate sections need from the page shell. */
export interface GateCtx {
  fb: GateFirebase;
  env: () => EnvSnapshot;
  routeInput: (choice: UserChoice) => RouteInput;
  /** Calls `fn` now and whenever the environment changes. */
  onEnv: (fn: () => void) => void;
  /** Shared by Grade and Run go/no-go. */
  inference: InferenceLock;
}
