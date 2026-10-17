export function shouldCompleteTurn(distance: number, velocity: number, threshold: number) {
  'worklet';
  // Releasing a short pull always cancels, even after a fast flick.
  return Math.abs(distance) >= threshold && Math.sign(distance) * velocity >= -80;
}

export function turnDuration(velocity: number) {
  'worklet';
  return Math.max(200, Math.min(350, 320 - Math.abs(velocity) / 12));
}
