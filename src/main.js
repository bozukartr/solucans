import './styles/main.css';
import { AppController } from './ui/AppController.js';
import { createGame } from './game/createGame.js';

const app = new AppController();

const { game, scene } = createGame({
  onHud: (state) => app.updateHud(state),
  onMinimap: (state) => app.drawMinimap(state),
  onGameOver: (result) => app.showGameOver(result),
});

app.connect(scene);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.loop.sleep();
    return;
  }

  game.loop.wake();
});
