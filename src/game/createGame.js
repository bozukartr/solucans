import Phaser from 'phaser';
import { ArenaScene } from './ArenaScene.js';
import { COLORS } from './config.js';

export function createGame(hooks) {
  const scene = new ArenaScene(hooks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: COLORS.deep,
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [scene],
  });

  return { game, scene };
}
