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

/** Blends two 0xRRGGBB colors, `amount` 0 keeps `color`, 1 returns `target`. */
export function mixColor(color, target, amount) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  const targetRed = (target >> 16) & 0xff;
  const targetGreen = (target >> 8) & 0xff;
  const targetBlue = target & 0xff;

  return (
    ((red + (targetRed - red) * amount) << 16) |
    ((green + (targetGreen - green) * amount) << 8) |
    (blue + (targetBlue - blue) * amount)
  );
}

export function lighten(color, amount) {
  return mixColor(color, 0xffffff, amount);
}

export function darken(color, amount) {
  return mixColor(color, 0x000000, amount);
}
