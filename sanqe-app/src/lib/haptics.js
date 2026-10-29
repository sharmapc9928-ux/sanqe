// Short vibration on supported phones (Android Chrome / TWA). No-op elsewhere.
export function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
  } catch {
    // some browsers throw if vibration is blocked — ignore
  }
}

export const HAPTIC_CORRECT = 18
export const HAPTIC_WRONG = [30, 60, 30]
