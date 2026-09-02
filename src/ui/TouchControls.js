import { CONTROL_LAYOUTS } from './settingsStore.js';

const STICK_RADIUS = 58;
const DEAD_ZONE = 7;

/**
 * Invisible dual-zone touch controls.
 *
 * One half of the screen steers with a floating joystick, the other half is a
 * boost pad. Both are transparent until a finger lands on them, and they spawn
 * exactly under the finger instead of at a fixed corner. The half that steers
 * is a user preference, so left-handed players can swap the two zones.
 */
export class TouchControls {
  constructor({ settings, onSteer, onBoost, isActive }) {
    this.settings = settings;
    this.onSteer = onSteer;
    this.onBoost = onBoost;
    this.isActive = isActive;

    this.layer = document.querySelector('#touch-layer');
    this.stick = document.querySelector('#joystick');
    this.thumb = document.querySelector('#joystick-thumb');
    this.pad = document.querySelector('#boost-pad');

    this.movePointerId = null;
    this.boostPointerId = null;
    this.origin = { x: 0, y: 0 };

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.placeIdleControls = this.placeIdleControls.bind(this);

    this.applySettings();
    this.settings.subscribe(() => this.applySettings());
    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('pointerdown', this.handlePointerDown, {
      passive: false,
    });
    window.addEventListener('pointermove', this.handlePointerMove, {
      passive: false,
    });
    window.addEventListener('pointerup', this.handlePointerEnd);
    window.addEventListener('pointercancel', this.handlePointerEnd);
    window.addEventListener('resize', this.placeIdleControls);
    window.addEventListener('orientationchange', this.placeIdleControls);
  }

  applySettings() {
    this.layer.dataset.layout = this.settings.get('controlLayout');
    this.layer.classList.toggle(
      'is-always-visible',
      this.settings.get('visibleControls'),
    );
    this.reset();
  }

  movesOnLeft() {
    return this.settings.get('controlLayout') === CONTROL_LAYOUTS.moveLeft;
  }

  zoneAt(x) {
    const onLeftHalf = x < window.innerWidth / 2;
    return onLeftHalf === this.movesOnLeft() ? 'move' : 'boost';
  }

  placeIdleControls() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const inset = Math.min(150, Math.max(96, width * 0.16));
    const bottom = height - Math.min(140, Math.max(96, height * 0.28));
    const moveX = this.movesOnLeft() ? inset : width - inset;

    if (this.movePointerId === null) this.placeElement(this.stick, moveX, bottom);
    if (this.boostPointerId === null) {
      this.placeElement(this.pad, width - moveX, bottom);
    }
  }

  placeElement(element, x, y) {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  handlePointerDown(event) {
    if (event.pointerType !== 'touch' || !this.isActive()) return;

    const zone = this.zoneAt(event.clientX);
    if (zone === 'move') {
      if (this.movePointerId !== null) return;
      this.movePointerId = event.pointerId;
      this.origin.x = event.clientX;
      this.origin.y = event.clientY;
      this.placeElement(this.stick, event.clientX, event.clientY);
      this.moveThumb(0, 0);
      this.stick.classList.add('is-active');
      event.preventDefault();
      return;
    }

    if (this.boostPointerId !== null) return;
    this.boostPointerId = event.pointerId;
    this.placeElement(this.pad, event.clientX, event.clientY);
    this.pad.classList.add('is-active');
    this.onBoost(true);
    this.vibrate(12);
    event.preventDefault();
  }

  handlePointerMove(event) {
    if (event.pointerId !== this.movePointerId) return;

    let deltaX = event.clientX - this.origin.x;
    let deltaY = event.clientY - this.origin.y;
    const distance = Math.hypot(deltaX, deltaY);

    // Dragging past the ring drags the ring along, so the stick never runs out
    // of travel during a long swipe.
    if (distance > STICK_RADIUS) {
      const overshoot = (distance - STICK_RADIUS) / distance;
      this.origin.x += deltaX * overshoot;
      this.origin.y += deltaY * overshoot;
      deltaX = event.clientX - this.origin.x;
      deltaY = event.clientY - this.origin.y;
      this.placeElement(this.stick, this.origin.x, this.origin.y);
    }

    this.moveThumb(deltaX, deltaY);

    if (distance > DEAD_ZONE) {
      const length = Math.hypot(deltaX, deltaY) || 1;
      this.onSteer(deltaX / length, deltaY / length);
    }

    event.preventDefault();
  }

  handlePointerEnd(event) {
    if (event.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.stick.classList.remove('is-active');
      this.moveThumb(0, 0);
      this.placeIdleControls();
      return;
    }

    if (event.pointerId === this.boostPointerId) {
      this.boostPointerId = null;
      this.pad.classList.remove('is-active');
      this.onBoost(false);
      this.placeIdleControls();
    }
  }

  moveThumb(x, y) {
    this.thumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  vibrate(duration) {
    if (!this.settings.get('haptics')) return;
    try {
      navigator.vibrate?.(duration);
    } catch {
      // Vibration is a nicety; ignore devices that refuse it.
    }
  }

  reset() {
    if (this.boostPointerId !== null) this.onBoost(false);
    this.movePointerId = null;
    this.boostPointerId = null;
    this.stick.classList.remove('is-active');
    this.pad.classList.remove('is-active');
    this.moveThumb(0, 0);
    this.placeIdleControls();
  }
}
