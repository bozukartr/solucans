export const TAU = Math.PI * 2;

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function pickRandom(items) {
  return items[(Math.random() * items.length) | 0];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function angleDifference(target, current) {
  let difference = (target - current) % TAU;
  if (difference > Math.PI) difference -= TAU;
  if (difference < -Math.PI) difference += TAU;
  return difference;
}

export function hexToNumber(color) {
  return Number.parseInt(color.slice(1), 16);
}
