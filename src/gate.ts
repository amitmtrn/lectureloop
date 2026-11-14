import './gate.css';
import { InferenceMode } from 'firebase/ai';
import { hasOnDeviceAdapter } from './ai';
import { appCheckResponds, firebaseStatus } from './firebase';
import { initBatch } from './gate-batch';
import { probeAvailability, probeBrowser } from './gate-env';
import { initGateFirebase } from './gate-firebase';
import { initGateShell, PREPARE_STALL_MS } from './gate-shell';
import { initSingleGrade } from './gate-single';
import { getGradeModel, prepareGradeDevice } from './grade';

const fb = initGateFirebase(firebaseStatus);

const shell = initGateShell({
  fb,
  browser: probeBrowser(),
  probe: probeAvailability,
  adapterAttached: () => hasOnDeviceAdapter(getGradeModel(fb.ai, InferenceMode.ONLY_ON_DEVICE)),
  prepare: (onProgress) => prepareGradeDevice(fb.ai, onProgress),
  appCheckResponds,
  appCheckWaitMs: 8000,
  prepareStallMs: PREPARE_STALL_MS,
  pollMs: 3000,
  isOnline: () => navigator.onLine,
});

initSingleGrade(shell.ctx);
initBatch(shell.ctx);
shell.start();
