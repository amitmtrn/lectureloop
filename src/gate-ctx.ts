import type { GateFirebase } from './gate-firebase';
import type { EnvSnapshot } from './gate-env';
import type { RouteInput, UserChoice } from './routing';

/** What the gate sections need from the page shell. */
export interface GateCtx {
  fb: GateFirebase;
  env: () => EnvSnapshot;
  routeInput: (choice: UserChoice) => RouteInput;
  /** Calls `fn` now and whenever the environment changes. */
  onEnv: (fn: () => void) => void;
}
