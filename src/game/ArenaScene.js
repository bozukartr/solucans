import Phaser from 'phaser';
import { BOT_NAMES, COLORS, FOOD_CELL_SIZE, GAME, PALETTE } from './config.js';
import { createBotBrain, updateBot } from './BotBrain.js';
import {
  TAU,
  angleDifference,
  clamp,
  hexToNumber,
  pickRandom,
  randomBetween,
} from './math.js';

export class ArenaScene extends Phaser.Scene {
  constructor(hooks = {}) {
    super({ key: 'arena' });
    this.hooks = hooks;
    this.ready = false;
    this.pendingAction = null;
    this.snakeId = 0;
    this.difficulty = 'normal';
    this.elapsed = 0;
    this.feasts = [];
    this.foodGrid = new Map();
  }

  create() {
    this.worldGraphics = this.add.graphics();
    this.worldGraphics.setDepth(0);
    this.boostKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aim = { x: 0, y: -1 };
    this.boosting = false;
    this.hudElapsed = 0;
    this.minimapElapsed = 0;

    // Touch steering comes from the on-screen joystick, so only mouse and pen
    // pointers aim at the cursor.
    this.input.on('pointermove', (pointer) => {
      if (!pointer.wasTouch) this.updateAim(pointer);
    });
    this.input.on('pointerdown', (pointer) => {
      if (pointer.wasTouch) return;
      this.updateAim(pointer);
      this.boosting = true;
    });
    this.input.on('pointerup', (pointer) => {
      if (!pointer.wasTouch) this.boosting = false;
    });
    this.input.on('gameout', () => {
      this.boosting = false;
    });

    this.ready = true;
    const action = this.pendingAction;
    this.pendingAction = null;

    if (action?.type === 'play') {
      this.startGame(action.name);
    } else {
      this.showDemo();
    }
  }

  startGame(name = 'Sen') {
    if (!this.ready) {
      this.pendingAction = { type: 'play', name };
      return;
    }

    this.createWorld({ withPlayer: true, name });
  }

  showDemo() {
    if (!this.ready) {
      this.pendingAction = { type: 'demo' };
      return;
    }

    this.createWorld({ withPlayer: false });
  }

  setBoosting(active) {
    this.boosting = active;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
  }

  /** Steering from the touch joystick, as a unit vector on screen. */
  setSteerVector(x, y) {
    this.aim.x = x * 100;
    this.aim.y = y * 100;
  }

  createWorld({ withPlayer, name = 'Sen' }) {
    this.endTimer?.remove(false);
    this.snakes?.forEach((snake) => snake.label.destroy());

    this.snakes = [];
    this.foods = [];
    this.particles = [];
    this.feasts = [];
    this.player = null;
    this.eaten = 0;
    this.shake = 0;
    this.boosting = false;

    for (let index = 0; index < GAME.foodCount; index += 1) {
      this.foods.push(this.createFood());
    }

    if (withPlayer) {
      this.player = this.createSnake({ isPlayer: true, name });
      this.snakes.push(this.player);
    }

    const botTotal = withPlayer ? GAME.botCount : GAME.botCount + 1;
    for (let index = 0; index < botTotal; index += 1) {
      const bot = this.createSnake();
      bot.mass = randomBetween(20, 260);
      this.snakes.push(bot);
    }

    this.showcase = this.player ?? this.snakes[0];
    this.mode = withPlayer ? 'playing' : 'menu';
    this.cameraState = {
      x: this.showcase.x,
      y: this.showcase.y,
      zoom: withPlayer ? 1 : 0.9,
      targetZoom: withPlayer ? 1 : 0.9,
    };

    this.cameras.main.centerOn(this.cameraState.x, this.cameraState.y);
    this.cameras.main.setZoom(this.cameraState.zoom);
    if (withPlayer) this.emitHud();
  }

  createFood(x, y, value, color) {
    const angle = randomBetween(0, TAU);
    const distance = Math.sqrt(Math.random()) * (GAME.arenaRadius - 30);

    return {
      x: x ?? Math.cos(angle) * distance,
      y: y ?? Math.sin(angle) * distance,
      value: value ?? 1,
      color: color ?? pickRandom(PALETTE),
      phase: randomBetween(0, TAU),
      dead: false,
    };
  }

  createSnake({ isPlayer = false, name } = {}) {
    const angle = randomBetween(0, TAU);
    const distance = Math.sqrt(Math.random()) * (GAME.arenaRadius * 0.8);
    const color = isPlayer ? COLORS.player : pickRandom(PALETTE);
    const snake = {
      id: (this.snakeId += 1),
      bot: !isPlayer,
      name: name || pickRandom(BOT_NAMES),
      color,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      angle: randomBetween(0, TAU),
      targetAngle: 0,
      mass: 14,
      boost: false,
      alive: true,
      path: [],
      collisionPoints: [],
      brain: isPlayer ? null : createBotBrain(this.difficulty),
      dropTime: 0,
      label: null,
    };

    if (snake.brain) snake.brain.desiredAngle = snake.angle;

    snake.targetAngle = snake.angle;
    snake.path.push({ x: snake.x, y: snake.y });
    snake.label = this.add
      .text(snake.x, snake.y, snake.name, {
        fontFamily: 'Nunito, Avenir Next, Segoe UI, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#dff6f2',
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.55)
      .setDepth(2);

    return snake;
  }

  updateAim(pointer) {
    this.aim.x = pointer.x - this.scale.width / 2;
    this.aim.y = pointer.y - this.scale.height / 2;
  }

  update(time, delta) {
    if (!this.snakes?.length) return;

    const step = Math.min(0.05, delta / 1000);
    this.elapsed += step;
    if (this.mode !== 'over') this.updateWorld(step);
    else this.updateParticles(step);

    this.updateCamera(step);
    this.drawWorld(time);
    this.updateLabels();

    if (this.mode === 'playing' || this.mode === 'ending') {
      this.hudElapsed += step;
      this.minimapElapsed += step;

      if (this.hudElapsed >= 0.1) {
        this.hudElapsed = 0;
        this.emitHud();
      }
      if (this.minimapElapsed >= 1 / 30) {
        this.minimapElapsed = 0;
        this.emitMinimap();
      }
    }
  }

  updateWorld(delta) {
    this.buildFoodGrid();
    this.feasts = this.feasts.filter((feast) => feast.expiresAt > this.elapsed);

    if (this.mode === 'playing' && this.player?.alive) {
      const aimDistance = Math.hypot(this.aim.x, this.aim.y);
      if (aimDistance > 12) {
        this.player.targetAngle = Math.atan2(this.aim.y, this.aim.x);
      }
      this.player.boost =
        (this.boosting || this.boostKey?.isDown) && this.player.mass > 22;
    }

    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      if (snake.bot) updateBot(this, snake, delta);
      this.moveSnake(snake, delta);
    }

    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      this.eatFood(snake);
      this.checkCollision(snake);
    }

    const retained = [];
    for (const snake of this.snakes) {
      if (snake.alive || snake === this.player) {
        retained.push(snake);
      } else {
        snake.label.destroy();
      }
    }
    this.snakes = retained;

    const desiredCount = GAME.botCount + 1;
    while (this.snakes.length < desiredCount) {
      const bot = this.createSnake();
      bot.mass = randomBetween(20, 180);
      this.snakes.push(bot);
    }

    this.foods = this.foods.filter((food) => !food.dead);
    while (this.foods.length < GAME.foodCount) this.foods.push(this.createFood());
    this.updateParticles(delta);
  }

  updateParticles(delta) {
    for (const particle of this.particles) {
      particle.time += delta;
      particle.x += particle.velocityX * delta;
      particle.y += particle.velocityY * delta;
      particle.velocityX *= 0.94;
      particle.velocityY *= 0.94;
    }

    this.particles = this.particles.filter(
      (particle) => particle.time < particle.life,
    );
  }

  moveSnake(snake, delta) {
    const radius = this.snakeRadius(snake);
    const turn = (5.2 - Math.min(2.6, radius * 0.11)) * delta;
    snake.angle += clamp(
      angleDifference(snake.targetAngle, snake.angle),
      -turn,
      turn,
    );

    const isBoosting = snake.boost && snake.mass > 22;
    if (isBoosting) {
      snake.mass -= 9 * delta;
      snake.dropTime += delta;

      if (snake.dropTime > 0.14) {
        snake.dropTime = 0;
        const tailIndex = Math.min(
          snake.path.length - 1,
          (this.snakeLength(snake) / GAME.pathDistance) | 0,
        );
        const tail = snake.path[tailIndex] ?? snake.path.at(-1);
        this.foods.push(
          this.createFood(
            tail.x + randomBetween(-4, 4),
            tail.y + randomBetween(-4, 4),
            1.4,
            snake.color,
          ),
        );
      }
    }

    const speed =
      (isBoosting ? GAME.boostSpeed : GAME.speed) *
      (1 - Math.min(0.22, snake.mass * 0.00006));
    const nextX = snake.x + Math.cos(snake.angle) * speed * delta;
    const nextY = snake.y + Math.sin(snake.angle) * speed * delta;
    const head = snake.path[0];
    const distanceFromHead = Math.hypot(nextX - head.x, nextY - head.y);

    if (distanceFromHead > GAME.pathDistance) {
      const steps = Math.min(8, (distanceFromHead / GAME.pathDistance) | 0);
      for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps;
        snake.path.unshift({
          x: head.x + (nextX - head.x) * ratio,
          y: head.y + (nextY - head.y) * ratio,
        });
      }
    }

    snake.x = nextX;
    snake.y = nextY;
    const maxPath = Math.ceil(this.snakeLength(snake) / GAME.pathDistance) + 3;
    if (snake.path.length > maxPath) snake.path.length = maxPath;

    const collisionStep = Math.max(
      2,
      Math.round((radius * 0.85) / GAME.pathDistance),
    );
    snake.collisionPoints.length = 0;
    for (
      let index = collisionStep * 2;
      index < snake.path.length;
      index += collisionStep
    ) {
      snake.collisionPoints.push(snake.path[index]);
    }

    if (Math.hypot(snake.x, snake.y) > GAME.arenaRadius - radius) {
      this.killSnake(snake, 'wall');
    }
  }

  eatFood(snake) {
    const eatRadius = this.snakeRadius(snake) + 14;
    const eatRadiusSquared = eatRadius * eatRadius;

    this.forEachFoodNear(snake.x, snake.y, eatRadius, (food) => {
      const x = food.x - snake.x;
      const y = food.y - snake.y;
      if (x * x + y * y >= eatRadiusSquared) return;

      food.dead = true;
      snake.mass += food.value * 2.2;
      if (snake === this.player) {
        this.eaten += 1;
        this.createBurst(food.x, food.y, food.color, 4);
      }
    });
  }

  /**
   * A uniform grid over the pellets, rebuilt each frame. Eating and the bot
   * brains both ask "what is around this point?", which would otherwise mean
   * walking all 600-odd pellets many times per frame.
   */
  buildFoodGrid() {
    this.foodGrid.clear();
    for (const food of this.foods) {
      if (food.dead) continue;
      const key = this.cellKey(food.x, food.y);
      const bucket = this.foodGrid.get(key);
      if (bucket) bucket.push(food);
      else this.foodGrid.set(key, [food]);
    }
  }

  cellKey(x, y) {
    const column = Math.floor(x / FOOD_CELL_SIZE);
    const row = Math.floor(y / FOOD_CELL_SIZE);
    return column * 4096 + row;
  }

  forEachFoodNear(x, y, radius, visit) {
    const minColumn = Math.floor((x - radius) / FOOD_CELL_SIZE);
    const maxColumn = Math.floor((x + radius) / FOOD_CELL_SIZE);
    const minRow = Math.floor((y - radius) / FOOD_CELL_SIZE);
    const maxRow = Math.floor((y + radius) / FOOD_CELL_SIZE);

    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const bucket = this.foodGrid.get(column * 4096 + row);
        if (!bucket) continue;
        for (const food of bucket) {
          if (!food.dead) visit(food);
        }
      }
    }
  }

  foodValueNear(x, y, radius) {
    const radiusSquared = radius * radius;
    let total = 0;

    this.forEachFoodNear(x, y, radius, (food) => {
      const dx = food.x - x;
      const dy = food.y - y;
      if (dx * dx + dy * dy < radiusSquared) total += food.value;
    });

    return total;
  }

  checkCollision(snake) {
    const radius = this.snakeRadius(snake);

    for (const other of this.snakes) {
      if (other === snake || !other.alive) continue;
      const gap = this.snakeLength(other) + radius + 40;
      if (Math.hypot(other.x - snake.x, other.y - snake.y) > gap) continue;

      const collisionRadius = (radius + this.snakeRadius(other) * 0.9) ** 2;
      for (const point of other.collisionPoints) {
        const x = point.x - snake.x;
        const y = point.y - snake.y;
        if (x * x + y * y >= collisionRadius) continue;
        this.killSnake(snake, other.name);
        return;
      }
    }
  }

  killSnake(snake, reason) {
    if (!snake.alive) return;
    snake.alive = false;
    snake.label.setVisible(false);

    const foodStep = Math.max(
      2,
      Math.round((this.snakeRadius(snake) * 1.5) / GAME.pathDistance),
    );
    for (let index = 0; index < snake.path.length; index += foodStep) {
      const point = snake.path[index];
      this.foods.push(
        this.createFood(
          point.x + randomBetween(-6, 6),
          point.y + randomBetween(-6, 6),
          randomBetween(2, 4.5),
          snake.color,
        ),
      );
    }
    this.createBurst(snake.x, snake.y, snake.color, 26);

    // A wreck is a pile of free mass; the bots race each other to it.
    this.feasts.push({
      x: snake.x,
      y: snake.y,
      value: snake.mass,
      expiresAt: this.elapsed + clamp(4 + snake.mass * 0.02, 4, 16),
    });

    if (snake === this.player) {
      this.shake = 16;
      this.finishGame(reason);
    }
  }

  finishGame(reason) {
    if (this.mode !== 'playing') return;
    this.mode = 'ending';
    const ranking = [...this.snakes].sort((a, b) => b.mass - a.mass);
    const result = {
      length: Math.floor(this.player.mass),
      rank: ranking.indexOf(this.player) + 1,
      eaten: this.eaten,
      message:
        reason === 'wall'
          ? 'Sınıra fazla yaklaştın.'
          : `${reason} adlı yılana çarptın.`,
    };

    this.endTimer = this.time.delayedCall(700, () => {
      this.mode = 'over';
      this.hooks.onGameOver?.(result);
    });
  }

  createBurst(x, y, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(0, TAU);
      const speed = randomBetween(30, 190);
      this.particles.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life: randomBetween(0.3, 0.8),
        time: 0,
        color,
        radius: randomBetween(1.5, 4),
      });
    }
  }

  updateCamera(delta) {
    if (!this.showcase?.alive) {
      this.showcase = this.player?.alive
        ? this.player
        : this.snakes.find((snake) => snake.alive);
    }
    if (!this.showcase) return;

    if (this.player?.alive) {
      this.cameraState.targetZoom = clamp(
        1.15 - this.player.mass * 0.00035,
        0.5,
        1.15,
      );
    } else if (this.mode === 'menu') {
      this.cameraState.targetZoom = 0.9;
    }

    this.cameraState.zoom +=
      (this.cameraState.targetZoom - this.cameraState.zoom) *
      Math.min(1, delta * 2.5);
    this.cameraState.x +=
      (this.showcase.x - this.cameraState.x) * Math.min(1, delta * 9);
    this.cameraState.y +=
      (this.showcase.y - this.cameraState.y) * Math.min(1, delta * 9);
    this.shake = Math.max(0, this.shake - delta * 40);

    const shakeX = this.shake ? randomBetween(-this.shake, this.shake) : 0;
    const shakeY = this.shake ? randomBetween(-this.shake, this.shake) : 0;
    this.cameras.main.centerOn(
      this.cameraState.x + shakeX,
      this.cameraState.y + shakeY,
    );
    this.cameras.main.setZoom(this.cameraState.zoom);
  }

  drawWorld(time) {
    const graphics = this.worldGraphics;
    const zoom = this.cameraState.zoom;
    const halfWidth = this.scale.width / zoom / 2 + 80;
    const halfHeight = this.scale.height / zoom / 2 + 80;
    const left = this.cameraState.x - halfWidth;
    const right = this.cameraState.x + halfWidth;
    const top = this.cameraState.y - halfHeight;
    const bottom = this.cameraState.y + halfHeight;
    graphics.clear();

    const gridSize = 90;
    graphics.fillStyle(COLORS.grid, 0.055);
    for (
      let x = Math.floor(left / gridSize) * gridSize;
      x < right;
      x += gridSize
    ) {
      for (
        let y = Math.floor(top / gridSize) * gridSize;
        y < bottom;
        y += gridSize
      ) {
        graphics.fillCircle(x, y, 2);
      }
    }

    graphics.lineStyle(40, COLORS.border, 0.12);
    graphics.strokeCircle(0, 0, GAME.arenaRadius);
    graphics.lineStyle(8, COLORS.border, 0.55);
    graphics.strokeCircle(0, 0, GAME.arenaRadius);

    for (const food of this.foods) {
      if (
        food.x < left ||
        food.x > right ||
        food.y < top ||
        food.y > bottom
      ) {
        continue;
      }

      const pulse = 1 + Math.sin(time / 400 + food.phase) * 0.12;
      const size = (4 + food.value * 1.5) * pulse;
      const color = hexToNumber(food.color);
      graphics.fillStyle(color, 0.12);
      graphics.fillCircle(food.x, food.y, size * 2.2);
      graphics.fillStyle(color, 0.9);
      graphics.fillCircle(food.x, food.y, size * 0.66);
    }

    for (const snake of this.snakes) {
      if (snake.alive && snake !== this.player) this.drawSnake(snake);
    }
    if (this.player?.alive) this.drawSnake(this.player);

    for (const particle of this.particles) {
      const alpha = 1 - particle.time / particle.life;
      graphics.fillStyle(hexToNumber(particle.color), alpha);
      graphics.fillCircle(
        particle.x,
        particle.y,
        particle.radius * alpha + 0.6,
      );
    }
  }

  drawSnake(snake) {
    const graphics = this.worldGraphics;
    const radius = this.snakeRadius(snake);
    const pointStep = Math.max(
      1,
      Math.round((radius * 0.55) / GAME.pathDistance),
    );
    const maxLength = this.snakeLength(snake);
    const points = [snake.path[0]];

    for (
      let index = pointStep;
      index < snake.path.length && index * GAME.pathDistance < maxLength;
      index += pointStep
    ) {
      points.push(snake.path[index]);
    }

    const tail = snake.path[
      Math.min(snake.path.length - 1, Math.floor(maxLength / GAME.pathDistance))
    ];
    if (tail && points.at(-1) !== tail) points.push(tail);

    if (snake.boost) {
      this.strokePath(points, radius * 2.9, hexToNumber(snake.color), 0.2);
    }
    this.strokePath(points, radius * 2, hexToNumber(snake.color), 1);
    this.strokePath(points, radius * 0.75, 0xffffff, 0.3);

    graphics.fillStyle(hexToNumber(snake.color), 1);
    graphics.fillCircle(snake.x, snake.y, radius * 1.05);

    for (const side of [-1, 1]) {
      const eyeX =
        snake.x + Math.cos(snake.angle + side * 0.62) * radius * 0.62;
      const eyeY =
        snake.y + Math.sin(snake.angle + side * 0.62) * radius * 0.62;
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(eyeX, eyeY, radius * 0.34);
      graphics.fillStyle(0x062028, 1);
      graphics.fillCircle(
        eyeX + Math.cos(snake.angle) * radius * 0.13,
        eyeY + Math.sin(snake.angle) * radius * 0.13,
        radius * 0.17,
      );
    }
  }

  strokePath(points, width, color, alpha) {
    if (points.length < 2) return;
    const graphics = this.worldGraphics;
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      graphics.lineTo(points[index].x, points[index].y);
    }
    graphics.strokePath();
  }

  updateLabels() {
    for (const snake of this.snakes) {
      const radius = this.snakeRadius(snake);
      snake.label.setPosition(snake.x, snake.y - radius - 10);
      snake.label.setVisible(
        snake.alive && (snake === this.player || snake.mass > 60),
      );
    }
  }

  emitHud() {
    if (!this.player) return;
    const ranking = this.snakes
      .filter((snake) => snake.alive || snake === this.player)
      .sort((a, b) => b.mass - a.mass);
    const visible = ranking.slice(0, 5);
    const playerRank = ranking.indexOf(this.player);
    if (playerRank > 4) visible.push(this.player);

    this.hooks.onHud?.({
      length: Math.floor(this.player.mass),
      leaderboard: visible.map((snake) => ({
        rank: ranking.indexOf(snake) + 1,
        name: snake.name,
        score: Math.floor(snake.mass),
        isPlayer: snake === this.player,
      })),
    });
  }

  emitMinimap() {
    this.hooks.onMinimap?.({
      arenaRadius: GAME.arenaRadius,
      playerId: this.player?.id ?? null,
      snakes: this.snakes
        .filter((snake) => snake.alive)
        .map(({ id, x, y }) => ({ id, x, y })),
    });
  }

  snakeRadius(snake) {
    return 7 + Math.min(15, snake.mass * 0.022);
  }

  snakeLength(snake) {
    return 70 + Math.min(2600, snake.mass * 2.1);
  }
}
