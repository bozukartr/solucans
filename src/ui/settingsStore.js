const STORAGE_KEY = 'isikyilan.settings';

export const CONTROL_LAYOUTS = Object.freeze({
  moveLeft: 'move-left',
  moveRight: 'move-right',
});

export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
export const GAME_SPEEDS = Object.freeze(['calm', 'normal', 'fast']);
export const LEADERBOARD_SIZES = Object.freeze(['off', 'small', 'normal', 'large']);

// How many rows the scene should send for each leaderboard size.
export const LEADERBOARD_ROWS = Object.freeze({
  off: 0,
  small: 3,
  normal: 5,
  large: 8,
});

// Multiplies the base swimming speed.
export const GAME_SPEED_SCALES = Object.freeze({
  calm: 0.82,
  normal: 1,
  fast: 1.2,
});

export const DEFAULT_SETTINGS = Object.freeze({
  // Joystick on the left, boost on the right by default.
  controlLayout: CONTROL_LAYOUTS.moveLeft,
  // Touch controls stay invisible until a finger lands on the screen.
  visibleControls: false,
  haptics: true,
  fullscreen: true,
  difficulty: 'normal',
  gameSpeed: 'normal',
  leaderboard: 'normal',
  richGraphics: true,
});

const VALIDATORS = Object.freeze({
  controlLayout: (value) =>
    value === CONTROL_LAYOUTS.moveLeft || value === CONTROL_LAYOUTS.moveRight,
  visibleControls: (value) => typeof value === 'boolean',
  haptics: (value) => typeof value === 'boolean',
  fullscreen: (value) => typeof value === 'boolean',
  difficulty: (value) => DIFFICULTIES.includes(value),
  gameSpeed: (value) => GAME_SPEEDS.includes(value),
  leaderboard: (value) => LEADERBOARD_SIZES.includes(value),
  richGraphics: (value) => typeof value === 'boolean',
});

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const clean = {};
    for (const [key, validate] of Object.entries(VALIDATORS)) {
      if (key in parsed && validate(parsed[key])) clean[key] = parsed[key];
    }
    return clean;
  } catch {
    // A blocked or corrupted storage must never stop the game from booting.
    return {};
  }
}

export class SettingsStore {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS, ...readStoredSettings() };
    this.listeners = new Set();
  }

  get(key) {
    return this.values[key];
  }

  snapshot() {
    return { ...this.values };
  }

  set(key, value) {
    const validate = VALIDATORS[key];
    if (!validate || !validate(value) || this.values[key] === value) return;

    this.values[key] = value;
    this.persist();
    for (const listener of this.listeners) listener(this.snapshot(), key);
  }

  toggle(key) {
    this.set(key, !this.values[key]);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Preferences stay in memory when storage is unavailable.
    }
  }
}
