import { GAME } from './config.js';
import { TAU, angleDifference, clamp, randomBetween } from './math.js';

/**
 * Bot behaviour.
 *
 * Instead of "run at the nearest pellet, flee anything close", every bot scores
 * a fan of possible headings each time it makes a decision. The score mixes
 * food ahead, bodies in the way, the arena rim and how hard the turn is, so the
 * snakes commit to lines, cut corners and hesitate the way people do.
 *
 * Four things keep them from feeling robotic:
 *   - a reaction delay, so a decision sticks for a moment instead of updating
 *     every frame,
 *   - a personality (greed, caution, aggression, skill, love of boosting) drawn
 *     per snake, so no two play alike,
 *   - risk appetite: a bot chasing a kill or a wreck sets part of its caution
 *     aside, which is how most of them get themselves killed,
 *   - deliberate imperfection: a steering drift, attention lapses, and the
 *     occasional second-best line.
 */

const DIFFICULTY_TUNING = Object.freeze({
  easy: { skill: 0.6, aggression: 0.45, reaction: 1.55, boost: 0.55, caution: 1.2 },
  normal: { skill: 0.85, aggression: 0.85, reaction: 1, boost: 1, caution: 1 },
  hard: { skill: 1, aggression: 1.25, reaction: 0.72, boost: 1.3, caution: 0.88 },
});

// Small offsets first: a bot prefers a gentle correction over a hard swerve.
const HEADING_OFFSETS = Object.freeze([
  0, 0.14, -0.14, 0.32, -0.32, 0.55, -0.55, 0.85, -0.85, 1.2, -1.2, 1.65,
  -1.65, 2.15, -2.15,
]);

const MIN_RAY_SAMPLES = 4;
const MAX_RAY_SAMPLES = 9;

// The collision reflex fires on a fixed cadence rather than once per frame, so
// bots are exactly as alert on a 120Hz phone as on a struggling one.
const REFLEX_INTERVAL = 0.05;

export function createBotBrain(difficulty = 'normal') {
  const tuning = DIFFICULTY_TUNING[difficulty] ?? DIFFICULTY_TUNING.normal;
  const skill = clamp(randomBetween(0.4, 1) * tuning.skill, 0.2, 1);

  return {
    skill,
    greed: randomBetween(0.5, 1.2),
    caution: clamp(randomBetween(0.45, 1.2) * tuning.caution, 0.3, 1.35),
    aggression: clamp(randomBetween(0.05, 1) * tuning.aggression, 0, 1.25),
    boostLove: clamp(randomBetween(0.2, 1) * tuning.boost, 0.05, 1.3),
    // Sharper players read the arena sooner.
    reaction: randomBetween(0.1, 0.24) * tuning.reaction * (1.5 - skill * 0.6),
    focus: randomBetween(0.9, 2.4),
    driftPhase: randomBetween(0, TAU),
    driftSpeed: randomBetween(0.35, 1.15),
    state: 'forage',
    desiredAngle: 0,
    goal: null,
    goalTimer: 0,
    decisionTimer: randomBetween(0, 0.25),
    boostUntil: 0,
    boostCooldown: randomBetween(0.5, 4),
    panicUntil: 0,
    reflexTimer: randomBetween(0, 0.05),
    // How much of its caution the bot is currently setting aside.
    risk: 1,
  };
}

export function updateBot(scene, snake, delta) {
  const brain = snake.brain;
  brain.decisionTimer -= delta;
  brain.goalTimer -= delta;
  brain.boostCooldown -= delta;
  brain.reflexTimer -= delta;
  brain.driftPhase += delta * brain.driftSpeed;

  let emergency = null;
  if (brain.reflexTimer <= 0) {
    brain.reflexTimer = REFLEX_INTERVAL;
    emergency = scanEmergency(scene, snake);
  }
  if (emergency) {
    brain.state = 'evade';
    brain.desiredAngle = emergency.angle;
    brain.panicUntil = scene.elapsed + 0.25;
    brain.decisionTimer = Math.min(brain.decisionTimer, 0.05);
    brain.goalTimer = Math.min(brain.goalTimer, 0.2);

    if (
      emergency.severity > 0.55 &&
      snake.mass > 55 &&
      brain.boostLove > 0.35 &&
      scene.elapsed >= brain.boostUntil
    ) {
      brain.boostUntil = scene.elapsed + randomBetween(0.22, 0.55);
      brain.boostCooldown = randomBetween(1, 3);
    }
  } else if (brain.decisionTimer <= 0) {
    decide(scene, snake);
  }

  // A human hand never holds a perfectly straight line.
  const drift = Math.sin(brain.driftPhase) * (0.05 + (1 - brain.skill) * 0.14);
  snake.targetAngle = brain.desiredAngle + drift;
  snake.boost = scene.elapsed < brain.boostUntil && snake.mass > 34;
}

/**
 * Cheap probe just in front of the head, run on the reflex cadence. It is what
 * lets a bot flinch away from a body that crosses its path between decisions.
 */
function scanEmergency(scene, snake) {
  const brain = snake.brain;
  const radius = scene.snakeRadius(snake);
  const speed = snake.boost ? scene.baseBoostSpeed() : scene.baseSpeed();
  const reach = radius * 2 + speed * (0.16 + brain.caution * 0.14);
  const cos = Math.cos(snake.angle);
  const sin = Math.sin(snake.angle);
  const probeX = snake.x + cos * reach;
  const probeY = snake.y + sin * reach;

  const rim = GAME.arenaRadius - Math.hypot(probeX, probeY);
  const rimMargin = radius * 2.4 + 26;
  if (rim < rimMargin) {
    return {
      angle: swerve(snake, Math.atan2(-snake.y, -snake.x), 0.45),
      severity: clamp(1 - rim / rimMargin, 0, 1),
    };
  }

  // Two probes: what the head is about to touch, and the ground it covers on
  // the way there.
  const dangerRadius = (radius * 1.7 + 24) * brain.risk;
  const probes = [
    { x: probeX, y: probeY },
    { x: snake.x + cos * reach * 0.5, y: snake.y + sin * reach * 0.5 },
  ];

  let closest = null;
  let closestDistanceSquared = dangerRadius * dangerRadius;

  for (const other of scene.snakes) {
    if (other === snake || !other.alive) continue;
    const headGap = Math.hypot(other.x - snake.x, other.y - snake.y);
    if (headGap > reach + scene.snakeLength(other) + 60) continue;

    for (const point of other.collisionPoints) {
      for (const probe of probes) {
        const x = point.x - probe.x;
        const y = point.y - probe.y;
        const distanceSquared = x * x + y * y;
        if (distanceSquared >= closestDistanceSquared) continue;
        closestDistanceSquared = distanceSquared;
        closest = point;
      }
    }
  }

  if (!closest) return null;

  const away = Math.atan2(snake.y - closest.y, snake.x - closest.x);
  return {
    angle: swerve(snake, away, 0.42),
    severity: clamp(1 - Math.sqrt(closestDistanceSquared) / dangerRadius, 0, 1),
  };
}

/**
 * Turn away from `escapeAngle` the way a player would: slide past the obstacle
 * on whichever side is closer to the current heading instead of doubling back.
 */
function swerve(snake, escapeAngle, blend) {
  const side = angleDifference(escapeAngle, snake.angle) >= 0 ? 1 : -1;
  const tangent = escapeAngle - side * (Math.PI / 2);
  return tangent + angleDifference(escapeAngle, tangent) * blend;
}

function decide(scene, snake) {
  const brain = snake.brain;
  brain.decisionTimer = brain.reaction * randomBetween(0.8, 1.3);

  const radius = scene.snakeRadius(snake);
  const look = clamp(
    radius * 6 + scene.baseSpeed() * (0.65 + brain.caution * 0.5),
    150,
    520,
  );

  const neighbours = collectNeighbours(scene, snake, look * 1.6);
  const threats = collectThreats(scene, snake, neighbours, look * 1.5);

  if (!brain.goal || brain.goalTimer <= 0 || isGoalStale(snake)) {
    brain.goal = chooseGoal(scene, snake, neighbours);
    brain.goalTimer = brain.focus * randomBetween(0.6, 1.4);
  }

  const goal = brain.goal;
  brain.risk = riskAppetite(brain, goal);

  // Attention wanders. The reflex still runs on its own cadence, so a lapse
  // means a late read of the board rather than swimming in blind.
  if (Math.random() < 0.07 * (1.35 - brain.skill)) {
    brain.decisionTimer *= randomBetween(2.5, 5);
  }

  let bestAngle = snake.angle;
  let bestScore = -Infinity;
  let secondAngle = snake.angle;
  let secondScore = -Infinity;

  for (const offset of HEADING_OFFSETS) {
    const angle = snake.angle + offset;
    const score = scoreHeading(scene, snake, angle, offset, look, threats, goal);

    if (score > bestScore) {
      secondScore = bestScore;
      secondAngle = bestAngle;
      bestScore = score;
      bestAngle = angle;
    } else if (score > secondScore) {
      secondScore = score;
      secondAngle = angle;
    }
  }

  // Even good players misread a gap now and then.
  const mistakeChance = (1 - brain.skill) * 0.16;
  brain.desiredAngle =
    secondScore > -Infinity && Math.random() < mistakeChance
      ? secondAngle
      : bestAngle;

  decideBoost(scene, snake, goal);
}

/**
 * Chasing a kill or a wreck is worth taking a line you would otherwise refuse.
 * This is where bots get themselves killed, which is the point.
 */
function riskAppetite(brain, goal) {
  if (goal?.kind === 'prey') return clamp(1 - brain.aggression * 0.5, 0.4, 1);
  if (goal?.kind === 'feast') return clamp(1 - brain.greed * 0.28, 0.55, 1);
  return 1;
}

function scoreHeading(scene, snake, angle, offset, look, threats, goal) {
  const brain = snake.brain;
  const radius = scene.snakeRadius(snake);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Momentum: a sharp turn has to be clearly worth it.
  let score = -Math.abs(offset) * (6 + brain.skill * 5);

  const rimMargin = radius * 3 + 60;
  const dangerRadius = radius * 2 + 30;

  // Space the samples closer than the danger radius, otherwise a body lying
  // across the ray can slip through the gap between two of them.
  const sampleCount = clamp(
    Math.ceil(look / (dangerRadius * 0.8)),
    MIN_RAY_SAMPLES,
    MAX_RAY_SAMPLES,
  );

  // Keeps a dense ray scored on the same scale as a sparse one.
  const density = MIN_RAY_SAMPLES / sampleCount;

  for (let index = 1; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount;
    const sampleX = snake.x + cos * look * ratio;
    const sampleY = snake.y + sin * look * ratio;
    const nearTermWeight = (1.3 - ratio * 0.7) * density;

    const rim = GAME.arenaRadius - Math.hypot(sampleX, sampleY);
    if (rim < rimMargin) {
      score -=
        (rimMargin - rim) * 0.6 * nearTermWeight * (0.8 + brain.caution * 0.8);
    }

    for (const threat of threats) {
      const x = threat.x - sampleX;
      const y = threat.y - sampleY;
      const range = dangerRadius + threat.bulk;
      const distanceSquared = x * x + y * y;
      if (distanceSquared >= range * range) continue;

      const closeness = 1 - Math.sqrt(distanceSquared) / range;
      score -=
        closeness *
        closeness *
        threat.threat *
        150 *
        nearTermWeight *
        (0.6 + brain.caution * 0.7) *
        brain.risk;
    }

    score +=
      scene.foodValueNear(sampleX, sampleY, 78 + radius * 2) *
      brain.greed *
      5 *
      nearTermWeight;
  }

  if (goal) {
    const goalAngle = Math.atan2(goal.y - snake.y, goal.x - snake.x);
    score += Math.cos(angleDifference(goalAngle, angle)) * goal.weight;
  }

  return score;
}

function collectNeighbours(scene, snake, range) {
  const neighbours = [];
  for (const other of scene.snakes) {
    if (other === snake || !other.alive) continue;
    const distance = Math.hypot(other.x - snake.x, other.y - snake.y);
    if (distance > range + scene.snakeLength(other)) continue;
    neighbours.push({ snake: other, distance });
  }
  return neighbours;
}

function collectThreats(scene, snake, neighbours, range) {
  const threats = [];
  const rangeSquared = range * range;

  for (const { snake: other } of neighbours) {
    const otherRadius = scene.snakeRadius(other);
    const points = other.collisionPoints;
    const step = Math.max(1, Math.ceil(points.length / 18));

    for (let index = 0; index < points.length; index += step) {
      const point = points[index];
      const x = point.x - snake.x;
      const y = point.y - snake.y;
      if (x * x + y * y > rangeSquared) continue;
      threats.push({ x: point.x, y: point.y, bulk: otherRadius, threat: 1 });
    }

    // The space a rival is about to occupy is as dangerous as its body, and
    // giving a bigger snake room is what keeps a small one alive.
    const speed = other.boost ? scene.baseBoostSpeed() : scene.baseSpeed();
    const outmatched = other.mass > snake.mass;
    for (const lead of [0.3, 0.65]) {
      threats.push({
        x: other.x + Math.cos(other.angle) * speed * lead,
        y: other.y + Math.sin(other.angle) * speed * lead,
        bulk: otherRadius * 1.7,
        threat: outmatched ? 1.45 : 0.7,
      });
    }
  }

  return threats;
}

function isGoalStale(snake) {
  const goal = snake.brain.goal;
  if (!goal) return true;
  if (goal.food?.dead) return true;
  if (goal.prey && (!goal.prey.alive || goal.prey.mass > snake.mass * 0.85)) {
    return true;
  }
  return Math.hypot(goal.x - snake.x, goal.y - snake.y) < 70;
}

function chooseGoal(scene, snake, neighbours) {
  const brain = snake.brain;
  const radius = scene.snakeRadius(snake);

  // Staying inside the arena beats every other plan.
  const rimDistance = GAME.arenaRadius - Math.hypot(snake.x, snake.y);
  const safeMargin = radius * 6 + 110;
  if (rimDistance < safeMargin) {
    const inward = Math.atan2(-snake.y, -snake.x);
    brain.state = 'recover';
    return {
      kind: 'safety',
      x: snake.x + Math.cos(inward) * 420,
      y: snake.y + Math.sin(inward) * 420,
      distance: 420,
      weight: 55 + (safeMargin - rimDistance) * 0.35,
    };
  }

  const feast = findFeast(scene, snake, neighbours);
  if (feast) {
    brain.state = 'feast';
    return feast;
  }

  const prey = findPrey(scene, snake, neighbours);
  if (prey) {
    brain.state = 'hunt';
    return prey;
  }

  const cluster = findFoodCluster(scene, snake);
  if (cluster) {
    brain.state = 'forage';
    return cluster;
  }

  // Nothing worth chasing: big snakes coil in place, small ones roam.
  brain.state = 'roam';
  const turn = snake.mass > 320 ? randomBetween(0.6, 1.1) : randomBetween(-0.5, 0.5);
  const distance = snake.mass > 320 ? 280 : 520;
  return {
    kind: 'roam',
    x: snake.x + Math.cos(snake.angle + turn) * distance,
    y: snake.y + Math.sin(snake.angle + turn) * distance,
    distance,
    weight: 14,
  };
}

function findFeast(scene, snake, neighbours) {
  const brain = snake.brain;
  let best = null;
  let bestScore = 0;
  let bestCrowd = 0;

  for (const feast of scene.feasts) {
    const distance = Math.hypot(feast.x - snake.x, feast.y - snake.y);
    if (distance > 700) continue;

    // A scrum around a wreck is where players die. Careful ones hang back.
    let crowd = 0;
    for (const { snake: other } of neighbours) {
      if (Math.hypot(other.x - feast.x, other.y - feast.y) < 240) crowd += 1;
    }

    const score =
      (feast.value * brain.greed) /
      ((160 + distance) * (1 + crowd * brain.caution * 0.55));
    if (score <= bestScore) continue;
    bestScore = score;
    bestCrowd = crowd;
    best = { feast, distance };
  }

  if (!best) return null;
  return {
    kind: 'feast',
    x: best.feast.x,
    y: best.feast.y,
    distance: best.distance,
    weight: (38 * brain.greed) / (1 + bestCrowd * brain.caution * 0.4),
  };
}

function findPrey(scene, snake, neighbours) {
  const brain = snake.brain;
  if (brain.aggression < 0.45 || snake.mass < 90) return null;

  let prey = null;
  let preyDistance = 0;
  let bestScore = 0;

  for (const { snake: other, distance } of neighbours) {
    if (other.mass > snake.mass * 0.75) continue;
    if (distance > 240 + snake.mass * 0.35) continue;

    const score =
      (snake.mass / (other.mass + 60)) *
      (1 - distance / (900 + snake.mass)) *
      brain.aggression;
    if (score <= bestScore) continue;
    bestScore = score;
    prey = other;
    preyDistance = distance;
  }

  if (!prey) return null;

  // Aim at where the target will be, not where it is: the classic cut-off.
  const preySpeed = prey.boost ? scene.baseBoostSpeed() : scene.baseSpeed();
  const lead = clamp(preyDistance / scene.baseBoostSpeed(), 0.25, 1.2);
  return {
    kind: 'prey',
    prey,
    x: prey.x + Math.cos(prey.angle) * preySpeed * lead,
    y: prey.y + Math.sin(prey.angle) * preySpeed * lead,
    distance: preyDistance,
    weight: 40 * brain.aggression,
  };
}

function findFoodCluster(scene, snake) {
  const brain = snake.brain;
  const foods = scene.foods;
  if (!foods.length) return null;

  let best = null;
  let bestDistance = 0;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const food = foods[(Math.random() * foods.length) | 0];
    if (!food || food.dead) continue;

    const distance = Math.hypot(food.x - snake.x, food.y - snake.y);
    if (distance > 950) continue;
    if (Math.hypot(food.x, food.y) > GAME.arenaRadius - 60) continue;

    const cluster = scene.foodValueNear(food.x, food.y, 120);
    const score =
      (cluster * brain.greed + food.value * 3) /
      (90 + distance * (1.15 - brain.greed * 0.25));

    if (score <= bestScore) continue;
    bestScore = score;
    best = food;
    bestDistance = distance;
  }

  if (!best) return null;
  return {
    kind: 'food',
    food: best,
    x: best.x,
    y: best.y,
    distance: bestDistance,
    weight: 30 * brain.greed,
  };
}

function decideBoost(scene, snake, goal) {
  const brain = snake.brain;
  if (snake.mass < 60 || scene.elapsed < brain.boostUntil) return;
  if (brain.boostCooldown > 0) return;

  let chance = 0;
  if (goal?.kind === 'prey') {
    chance = 0.45 * brain.boostLove;
  } else if (goal?.kind === 'feast' && goal.distance > 240) {
    chance = 0.26 * brain.boostLove;
  } else if (goal?.kind === 'food' && goal.distance > 420 && snake.mass > 200) {
    chance = 0.1 * brain.boostLove;
  }

  if (Math.random() >= chance) return;

  brain.boostUntil =
    scene.elapsed + randomBetween(0.35, 1.1) * (0.6 + brain.boostLove * 0.5);
  brain.boostCooldown = randomBetween(1.6, 5.5) / (0.5 + brain.boostLove);
}
