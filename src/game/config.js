export const GAME = Object.freeze({
  arenaRadius: 1500,
  pathDistance: 5,
  speed: 128,
  boostSpeed: 232,
  foodCount: 620,
  botCount: 14,
});

// Cell size of the pellet lookup grid used by eating and by the bot brains.
export const FOOD_CELL_SIZE = 150;

export const COLORS = Object.freeze({
  deep: 0x04161d,
  grid: 0x4fe0c5,
  border: 0xff7a6b,
  player: '#4fe0c5',
});

export const PALETTE = Object.freeze([
  '#4fe0c5',
  '#ffb057',
  '#ff6b8a',
  '#a8ff5e',
  '#7ad0ff',
  '#c39bff',
  '#ff8f5e',
]);

export const BOT_NAMES = Object.freeze([
  'Mercan',
  'Zargana',
  'Vatoz',
  'Lakerda',
  'Kefal',
  'Sazan',
  'Yılanbalığı',
  'Karides',
  'Deniz',
  'Fener',
  'Sirena',
  'Poyraz',
  'Lodos',
  'Kırlangıç',
  'Mürekkep',
  'Dalgıç',
  'Sancak',
  'Gırgır',
]);
