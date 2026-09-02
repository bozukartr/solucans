import { SettingsStore } from './settingsStore.js';
import { SettingsPanel } from './SettingsPanel.js';
import { TouchControls } from './TouchControls.js';
import { requestLandscape } from './orientation.js';

const PLAYER_NAME_KEY = 'isikyilan.playerName';

export class AppController {
  constructor() {
    this.scene = null;
    this.currentName = this.readSavedName();
    this.settings = new SettingsStore();

    this.menuScreen = document.querySelector('#menu-screen');
    this.gameOverScreen = document.querySelector('#game-over-screen');
    this.playForm = document.querySelector('#play-form');
    this.nameInput = document.querySelector('#player-name');
    this.lengthValue = document.querySelector('#length-value');
    this.leaderboard = document.querySelector('#leaderboard');
    this.minimap = document.querySelector('#minimap');
    this.minimapContext = this.minimap.getContext('2d');

    this.settingsPanel = new SettingsPanel({ settings: this.settings });
    this.touchControls = new TouchControls({
      settings: this.settings,
      onSteer: (x, y) => this.scene?.setSteerVector(x, y),
      onBoost: (active) => this.scene?.setBoosting(active),
      isActive: () => document.body.dataset.screen === 'playing',
    });

    this.nameInput.value = this.currentName === 'Sen' ? '' : this.currentName;
    this.bindEvents();
  }

  connect(scene) {
    this.scene = scene;
    scene.setDifficulty(this.settings.get('difficulty'));
    this.settings.subscribe((values, key) => {
      if (key === 'difficulty') this.scene?.setDifficulty(values.difficulty);
    });
  }

  bindEvents() {
    this.playForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.normalizedName(this.nameInput.value);
      this.currentName = name;
      try {
        localStorage.setItem(PLAYER_NAME_KEY, name);
      } catch {
        // The game can continue when storage is blocked by the device.
      }
      this.nameInput.blur();
      requestLandscape();
      this.startRound(name);
    });

    document.querySelector('#settings-button').addEventListener('click', () => {
      this.settingsPanel.open();
    });

    document.querySelector('#retry-button').addEventListener('click', () => {
      this.startRound(this.currentName);
    });

    document.querySelector('#menu-button').addEventListener('click', () => {
      this.showMenu();
      this.scene?.showDemo();
    });
  }

  startRound(name) {
    this.showPlaying();
    this.scene?.startGame(name);
  }

  normalizedName(value) {
    return value.trim().slice(0, 12) || 'Sen';
  }

  readSavedName() {
    try {
      return this.normalizedName(localStorage.getItem(PLAYER_NAME_KEY) || '');
    } catch {
      return 'Sen';
    }
  }

  showPlaying() {
    document.body.dataset.screen = 'playing';
    this.menuScreen.hidden = true;
    this.gameOverScreen.hidden = true;
    this.settingsPanel.close();
    this.touchControls.reset();
  }

  showMenu() {
    document.body.dataset.screen = 'menu';
    this.gameOverScreen.hidden = true;
    this.menuScreen.hidden = false;
    this.nameInput.value = this.currentName === 'Sen' ? '' : this.currentName;
    this.touchControls.reset();
  }

  showGameOver(result) {
    document.body.dataset.screen = 'over';
    document.querySelector('#final-length').textContent = result.length;
    document.querySelector('#final-rank').textContent = result.rank;
    document.querySelector('#final-eaten').textContent = result.eaten;
    document.querySelector('#result-message').textContent = result.message;
    this.gameOverScreen.hidden = false;
    this.touchControls.reset();
  }

  updateHud({ length, leaderboard }) {
    this.lengthValue.textContent = length;
    const rows = leaderboard.map((entry) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row${entry.isPlayer ? ' is-player' : ''}`;

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(entry.rank).padStart(2, '0');

      const name = document.createElement('span');
      name.className = 'player';
      name.textContent = entry.name;

      const score = document.createElement('strong');
      score.textContent = entry.score;

      row.append(rank, name, score);
      return row;
    });

    this.leaderboard.replaceChildren(...rows);
  }

  drawMinimap({ arenaRadius, snakes, playerId }) {
    const rect = this.minimap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (this.minimap.width !== width || this.minimap.height !== height) {
      this.minimap.width = width;
      this.minimap.height = height;
    }

    const context = this.minimapContext;
    const size = Math.min(width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = size / 2 - 3 * dpr;
    const scale = radius / arenaRadius;

    context.clearRect(0, 0, width, height);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(3, 21, 28, .72)';
    context.fill();
    context.strokeStyle = 'rgba(79, 224, 197, .28)';
    context.lineWidth = 1.5 * dpr;
    context.stroke();

    for (const snake of snakes) {
      const isPlayer = snake.id === playerId;
      context.beginPath();
      context.arc(
        centerX + snake.x * scale,
        centerY + snake.y * scale,
        (isPlayer ? 3.2 : 1.8) * dpr,
        0,
        Math.PI * 2,
      );
      context.fillStyle = isPlayer ? '#4fe0c5' : 'rgba(223, 246, 242, .48)';
      context.fill();
    }
  }
}
