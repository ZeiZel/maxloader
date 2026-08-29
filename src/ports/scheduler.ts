export interface Scheduler {
  now(): number;
  sleep(ms: number): Promise<void>;
  request(callback: () => void): number;
  cancel(id: number): void;
}
