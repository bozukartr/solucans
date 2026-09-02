/**
 * The arena is built for a wide viewport, so touch devices are asked to stay in
 * landscape and to hide the browser chrome.
 *
 * Neither request is guaranteed. Fullscreen needs a user gesture and iPhone
 * Safari has no element fullscreen at all; the orientation lock additionally
 * needs the document to already be fullscreen. Everything below therefore fails
 * softly — the rotate overlay and the fullscreen pill in the HUD are the
 * fallbacks the player actually sees.
 */
export function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export function isPortrait() {
  return window.matchMedia?.('(orientation: portrait)').matches ?? false;
}

export function supportsFullscreen() {
  const element = document.documentElement;
  return Boolean(element.requestFullscreen || element.webkitRequestFullscreen);
}

export function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Must be called from inside a user gesture handler. */
export async function enterFullscreen() {
  if (isFullscreen() || !supportsFullscreen()) return false;

  const element = document.documentElement;
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await element.webkitRequestFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}

export async function lockLandscape() {
  if (typeof screen.orientation?.lock !== 'function') return false;

  try {
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    // Desktop browsers and unlocked mobile browsers both land here.
    return false;
  }
}

/**
 * Fullscreen first, because the orientation lock is only granted to a
 * fullscreen document.
 */
export async function goImmersive({ fullscreen = true } = {}) {
  if (!isTouchDevice()) return;
  if (fullscreen) await enterFullscreen();
  await lockLandscape();
}

export function onFullscreenChange(listener) {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
}
