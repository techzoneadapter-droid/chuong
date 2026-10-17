// In-memory, per-app SDK/UMP readiness. No ad loads until user consent permits it.
let ready = false;
const listeners = new Set<(value: boolean) => void>();
export function isAdSdkReady() { return ready; }
export function setAdSdkReady(value: boolean) {
  if (ready === value) return;
  ready = value;
  for (const listener of listeners) listener(ready);
}
export function subscribeAdSdkReady(listener: (value: boolean) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
