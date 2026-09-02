/**
 * The arena is built for a wide viewport, so touch devices are asked to stay in
 * landscape. Browsers only grant an orientation lock to a fullscreen document
 * after a user gesture, and several of them refuse it outright — the rotate
 * overlay in the markup is the fallback for those.
 */
export function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export function isPortrait() {
  return window.matchMedia?.('(orientation: portrait)').matches ?? false;
}

export async function requestLandscape() {
  if (!isTouchDevice() || typeof screen.orientation?.lock !== 'function') {
    return false;
  }

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    // Fullscreen is optional; the lock below may still work on some devices.
  }

  try {
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}
