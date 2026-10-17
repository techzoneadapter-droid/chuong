export type GestureSensitivity = 'low' | 'medium' | 'high';
export type ChapterDirection = 'previous' | 'next';
export const gestureThresholds = {
  low: { distance: 120, velocity: .12 },
  medium: { distance: 88, velocity: .10 },
  high: { distance: 64, velocity: .08 },
};

export type GestureStart = {
  x: number; y: number; width: number; height: number; topInset: number; bottomInset: number;
  atTop: boolean; atBottom: boolean; previous: boolean; next: boolean;
  leftInset?: number; rightInset?: number;
};
export function allowsGestureStart(start: GestureStart) {
  return start.x > Math.max(32, (start.leftInset ?? 0) + 12) && start.x < start.width - Math.max(32, (start.rightInset ?? 0) + 12)
    && start.y > start.topInset + 12 && start.y < start.height - start.bottomInset - 32;
}
export function chapterGestureDirection(start: GestureStart, dx: number, dy: number, horizontal: boolean, vertical: boolean): ChapterDirection | null {
  if (!allowsGestureStart(start)) return null;
  if (horizontal && Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy) * 2) {
    return dx < 0 ? (start.next ? 'next' : null) : (start.previous ? 'previous' : null);
  }
  if (vertical && Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx) * 2) {
    return dy < 0 ? (start.atBottom && start.next ? 'next' : null)
      : (start.atTop && start.previous ? 'previous' : null);
  }
  return null;
}
export function gestureReachedThreshold(distance: number, elapsed: number, sensitivity: GestureSensitivity) {
  const threshold = gestureThresholds[sensitivity] ?? gestureThresholds.medium;
  return elapsed > 0 && elapsed <= 1400 && Math.abs(distance) >= threshold.distance
    && Math.abs(distance) / elapsed >= threshold.velocity;
}
