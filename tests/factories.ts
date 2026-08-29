import { noopLogger, type Logger } from '../src/ports/logger';
import type { Scheduler } from '../src/ports/scheduler';
import type { ControllerDeps } from '../src/content';
import type { DownloadBridge } from '../src/download-bridge';

export const testLogger: Logger = noopLogger;
export const testSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export function testScheduler(): Scheduler {
  return { now: () => 0, sleep: testSleep, request: (cb) => { cb(); return 1; }, cancel: () => undefined };
}
export function controllerDeps(doc: Document, overrides: Partial<ControllerDeps> = {}): ControllerDeps {
  const bridge: DownloadBridge = { arm: () => false, expectCapture: () => undefined, disarm: () => undefined, download: () => undefined, settle: async () => ({ started: 0, failed: 0 }), stats: () => ({ started: 0, failed: 0 }), dispose: () => undefined };
  return { doc, createObserver: (callback) => new MutationObserver(callback), scheduler: testScheduler(), logger: testLogger, intervalMs: 0, makeBridge: () => bridge, createAbort: () => new AbortController(), ...overrides };
}
