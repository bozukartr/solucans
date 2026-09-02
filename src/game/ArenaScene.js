import Phaser from 'phaser';
import { BOT_NAMES, COLORS, FOOD_CELL_SIZE, GAME, PALETTE } from './config.js';
import { createBotBrain, updateBot } from './BotBrain.js';
import {
  TAU,
  angleDifference,
  clamp,
  darken,
  hexToNumber,
  lighten,
  mixColor,
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
    this.speedScale = 1;
    this.leaderboardRows = 5;
    this.richGraphics = true;
    this.elapsed = 0;
    this.feasts = [];
    this.foodGrid = new Map();
    this.dustLayers = [];
  }

  create() {
    this.createDustLayers();
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

  /**
   * Two tiled layers of drifting motes behind the arena. They scroll at
   * different rates against the camera, which reads as depth, and cost two
   * quads a frame instead of the couple of hundred circles a live dot grid
   * needed.
   */
  createDustLayers() {
    const specs = [
      { key: 'dust-far', dots: 34, spread: [0.5, 1.5], alpha: 0.5, parallax: 0.3, zoomScale: 1.7, tint: 0x2c6f7c },
      { key: 'dust-near', dots: 16, spread: [1, 2.6], alpha: 0.75, parallax: 0.68, zoomScale: 1, tint: 0x4fe0c5 },
    ];

    for (const spec of specs) {
      this.paintDustTexture(spec);
      const layer = this.add
        .tileSprite(0, 0, this.scale.width, this.scale.height, spec.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-10)
        .setTint(spec.tint)
        .setAlpha(spec.alpha);
      layer.dustSpec = spec;
      this.dustLayers.push(layer);
    }

    this.scale.on('resize', () => {
      for (const layer of this.dustLayers) {
        layer.setSize(this.scale.width, this.scale.height);
      }
    });
  }

  paintDustTexture({ key, dots, spread }) {
    const size = 256;
    if (this.textures.exists(key)) this.textures.remove(key);

    const texture = this.textures.createCanvas(key, size, size);
    const context = texture.getContext();
    context.clearRect(0, 0, size, size);

    for (let index = 0; index < dots; index += 1) {
      const radius = randomBetween(spread[0], spread[1]);
      const alpha = randomBetween(0.25, 1);
      context.beginPath();
      context.arc(
        randomBetween(radius, size - radius),
        randomBetween(radius, size - radius),
        radius,
        0,
        TAU,
      );
      context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      context.fill();
    }

    texture.refresh();
  }

  updateDustLayers() {
    const { x, y, zoom } = this.cameraState;
    for (const layer of this.dustLayers) {
      const { parallax, zoomScale } = layer.dustSpec;
      layer.setTileScale(zoom * zoomScale);
      layer.tilePositionX = (x * parallax) / zoomScale;
      layer.tilePositionY = (y * parallax) / zoomScale;
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

  setSpeedScale(scale) {
    this.speedScale = scale;
  }

  setLeaderboardRows(rows) {
    this.leaderboardRows = rows;
  }

  setRichGraphics(enabled) {
    this.richGraphics = enabled;
    // The near dust layer is a second full-screen blend; it is the first thing
    // to go when the player asks for cheaper graphics.
    this.dustLayers.at(-1)?.setVisible(enabled);
  }

  /** Base swimming speed after the player's speed preference. */
  baseSpeed() {
    return GAME.speed * this.speedScale;
  }

  baseBoostSpeed() {
    return GAME.boostSpeed * this.speedScale;
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
      blinkAt: this.elapsed + randomBetween(1, 7),
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

      if (this.richGraphics && Math.random() < 0.55) {
        const back = snake.angle + Math.PI + randomBetween(-0.5, 0.5);
        this.particles.push({
          x: snake.x + Math.cos(back) * radius,
          y: snake.y + Math.sin(back) * radius,
          velocityX: Math.cos(back) * randomBetween(20, 70),
          velocityY: Math.sin(back) * randomBetween(20, 70),
          life: randomBetween(0.18, 0.4),
          time: 0,
          color: snake.color,
          radius: randomBetween(1, 2.6),
        });
      }

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
      (isBoosting ? this.baseBoostSpeed() : this.baseSpeed()) *
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
    this.particles.push({
      x: snake.x,
      y: snake.y,
      velocityX: 0,
      velocityY: 0,
      life: 0.7,
      time: 0,
      color: snake.color,
      radius: this.snakeRadius(snake) * 1.5,
      spread: 130,
      ring: true,
    });

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
    this.updateDustLayers();
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
    this.view = { left, right, top, bottom };
    this.drawArenaRim(time);

    for (const food of this.foods) {
      if (
        food.x < left ||
        food.x > right ||
        food.y < top ||
        food.y > bottom
      ) {
        continue;
      }

      this.drawFood(food, time);
    }

    for (const snake of this.snakes) {
      if (snake.alive && snake !== this.player) this.drawSnake(snake);
    }
    if (this.player?.alive) {
      this.drawPlayerMarker(time);
      this.drawSnake(this.player);
    }

    this.drawParticles();
  }

  /**
   * The rim fades in from the deep instead of being a hard line, and warms up
   * as the player gets close enough for it to matter.
   */
  drawArenaRim(time) {
    const graphics = this.worldGraphics;
    const radius = GAME.arenaRadius;
    const pulse = 0.5 + Math.sin(time / 900) * 0.5;

    let alert = 0;
    if (this.player?.alive) {
      const gap = radius - Math.hypot(this.player.x, this.player.y);
      alert = clamp(1 - gap / 420, 0, 1);
    }

    graphics.lineStyle(72, COLORS.border, 0.06 + alert * 0.07);
    graphics.strokeCircle(0, 0, radius + 30);
    graphics.lineStyle(24, COLORS.border, 0.14 + alert * 0.12);
    graphics.strokeCircle(0, 0, radius);
    graphics.lineStyle(
      5,
      mixColor(COLORS.border, 0xffe6e0, 0.35 + pulse * 0.25),
      0.55 + alert * 0.35,
    );
    graphics.strokeCircle(0, 0, radius);
  }

  drawFood(food, time) {
    const graphics = this.worldGraphics;
    const pulse = 1 + Math.sin(time / 400 + food.phase) * 0.12;
    const size = (4 + food.value * 1.5) * pulse;
    const color = hexToNumber(food.color);

    graphics.fillStyle(color, 0.12);
    graphics.fillCircle(food.x, food.y, size * 2.2);
    graphics.fillStyle(color, 0.9);
    graphics.fillCircle(food.x, food.y, size * 0.66);
    graphics.fillStyle(lighten(color, 0.65), 0.9);
    graphics.fillCircle(food.x, food.y, size * 0.28);

    // Only the fat pellets dropped by a wreck earn a sparkle.
    if (!this.richGraphics || food.value < 2.4) return;

    const spin = time / 700 + food.phase;
    const reach = size * 2.4;
    graphics.lineStyle(1.4, lighten(color, 0.5), 0.5);
    for (let arm = 0; arm < 2; arm += 1) {
      const angle = spin + arm * (Math.PI / 2);
      graphics.beginPath();
      graphics.moveTo(
        food.x - Math.cos(angle) * reach,
        food.y - Math.sin(angle) * reach,
      );
      graphics.lineTo(
        food.x + Math.cos(angle) * reach,
        food.y + Math.sin(angle) * reach,
      );
      graphics.strokePath();
    }
  }

  /** A soft ring so you can always find yourself in a crowd. */
  drawPlayerMarker(time) {
    const graphics = this.worldGraphics;
    const radius = this.snakeRadius(this.player);
    const pulse = 0.5 + Math.sin(time / 520) * 0.5;

    graphics.lineStyle(2, hexToNumber(COLORS.player), 0.16 + pulse * 0.16);
    graphics.strokeCircle(
      this.player.x,
      this.player.y,
      radius * 2.6 + pulse * 5,
    );
  }

  drawParticles() {
    const graphics = this.worldGraphics;

    for (const particle of this.particles) {
      const progress = particle.time / particle.life;
      const alpha = 1 - progress;
      const color = hexToNumber(particle.color);

      if (particle.ring) {
        graphics.lineStyle(2 + alpha * 3, color, alpha * 0.5);
        graphics.strokeCircle(
          particle.x,
          particle.y,
          particle.radius + progress * particle.spread,
        );
        continue;
      }

      graphics.fillStyle(color, alpha);
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

    // A long body is mostly off screen; only the visible stretches are drawn.
    const runs = this.clipToView(points, radius * 4);
    if (!runs.length) return;

    // Rings sit a fixed distance apart rather than a fixed number of points,
    // so a long snake does not cost more of them per pixel than a short one.
    const ringStep = Math.max(
      3,
      Math.round((radius * 2.4) / (pointStep * GAME.pathDistance)),
    );

    const color = hexToNumber(snake.color);
    const outline = darken(color, 0.55);

    for (const run of runs) {
      if (snake.boost) {
        const flicker = 0.18 + Math.sin(this.elapsed * 22 + snake.id) * 0.06;
        this.strokePath(run, radius * 3.6, lighten(color, 0.3), flicker);
      } else if (this.richGraphics) {
        this.strokePath(run, radius * 3.1, lighten(color, 0.2), 0.085);
      }

      this.strokePath(run, radius * 2.3, outline, 1);
      this.strokePath(run, radius * 2, color, 1);
      this.strokePath(run, radius * 0.85, lighten(color, 0.7), 0.32);

      if (this.richGraphics && radius > 8.5) {
        this.drawScaleRings(run, radius, color, ringStep);
      }
    }

    // Strokes end square, so the tail gets a cap of its own.
    if (this.isVisible(tail, radius * 2)) {
      this.drawTailCap(tail, radius, color, outline);
    }

    this.drawSnakeHead(snake, radius, color, outline);
  }

  isVisible(point, margin = 0) {
    const view = this.view;
    if (!point || !view) return true;
    return (
      point.x >= view.left - margin &&
      point.x <= view.right + margin &&
      point.y >= view.top - margin &&
      point.y <= view.bottom + margin
    );
  }

  /**
   * Splits a polyline into the runs that touch the visible area, keeping one
   * point of slack on each side so a run still reaches the screen edge.
   */
  clipToView(points, margin) {
    const runs = [];
    let run = null;

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (this.isVisible(point, margin)) {
        if (!run) {
          run = [];
          const previous = points[index - 1];
          if (previous) run.push(previous);
          runs.push(run);
        }
        run.push(point);
      } else if (run) {
        run.push(point);
        run = null;
      }
    }

    return runs.filter((entry) => entry.length > 1);
  }

  drawTailCap(tail, radius, color, outline) {
    if (!tail) return;
    const graphics = this.worldGraphics;
    graphics.fillStyle(outline, 1);
    graphics.fillCircle(tail.x, tail.y, radius * 1.15);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(tail.x, tail.y, radius);
  }

  /** Rings across the body, the way scales band a real snake. */
  drawScaleRings(points, radius, color, step) {
    const graphics = this.worldGraphics;
    graphics.lineStyle(2.2, lighten(color, 0.55), 0.3);

    for (let index = 1; index < points.length - 1; index += step) {
      const point = points[index];
      const next = points[index + 1];
      const angle = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
      const reach = radius * 0.92;

      graphics.beginPath();
      graphics.moveTo(
        point.x - Math.cos(angle) * reach,
        point.y - Math.sin(angle) * reach,
      );
      graphics.lineTo(
        point.x + Math.cos(angle) * reach,
        point.y + Math.sin(angle) * reach,
      );
      graphics.strokePath();
    }
  }

  drawSnakeHead(snake, radius, color, outline) {
    const graphics = this.worldGraphics;

    graphics.fillStyle(outline, 1);
    graphics.fillCircle(snake.x, snake.y, radius * 1.2);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(snake.x, snake.y, radius * 1.05);
    graphics.fillStyle(lighten(color, 0.4), 0.45);
    graphics.fillCircle(
      snake.x - Math.cos(snake.angle) * radius * 0.2,
      snake.y - Math.sin(snake.angle) * radius * 0.2,
      radius * 0.62,
    );

    if (this.elapsed > snake.blinkAt + 0.13) {
      snake.blinkAt = this.elapsed + randomBetween(2.4, 7);
    }
    const blinking = this.elapsed >= snake.blinkAt;

    for (const side of [-1, 1]) {
      const eyeX =
        snake.x + Math.cos(snake.angle + side * 0.62) * radius * 0.62;
      const eyeY =
        snake.y + Math.sin(snake.angle + side * 0.62) * radius * 0.62;

      if (blinking) {
        graphics.fillStyle(darken(color, 0.25), 1);
        graphics.fillCircle(eyeX, eyeY, radius * 0.3);
        continue;
      }

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
    const rows = this.leaderboardRows;
    const visible = ranking.slice(0, rows);
    const playerRank = ranking.indexOf(this.player);
    if (rows > 0 && playerRank >= rows) visible.push(this.player);

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
