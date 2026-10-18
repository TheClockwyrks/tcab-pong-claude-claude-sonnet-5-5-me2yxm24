// The simulation: paddles, the AI, the ball's physics, serving, and scoring
// (specs/playfield.md, specs/balls.md, specs/modes/).

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  CUES,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLE_HH,
  OBSTACLE_HW,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { CueName } from "./constants";
import type {
  BallState,
  CaromState,
  ObstacleState,
  PaddleState,
  Side,
  TrailSample,
} from "./game";
import type { InputFrame } from "./input";
import { parkedBall } from "./world";
import type { Rng } from "./world";

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Slack that keeps float noise from dropping a sample on the age boundary. */
const TRAIL_EPSILON = 1e-9;

export interface Advance {
  readonly next: CaromState;
  /** The cues the frame raised, each once, in the order they should play. */
  readonly cues: readonly CueName[];
}

// ---- Paddles ---------------------------------------------------------------

/** Sets `vy`, then integrates and clamps a paddle as playfield.md states. */
function integratePaddle(
  paddle: DeepReadonly<PaddleState>,
  vy: number,
  dt: number,
): PaddleState {
  const unclamped = paddle.cy + vy * dt;
  const next = clamp(unclamped, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

function aiVelocity(state: DeepReadonly<CaromState>, dt: number): number {
  if (!state.ai.movement) return 0;
  const { ball } = state;
  const defending =
    state.ai.tracking && state.screen === "playing" && !!ball && ball.vx > 0;
  const target = defending && ball ? ball.y - ball.vy * AI_REACT : AI_HOME_Y;
  const deadzone = defending ? AI_DEADZONE : AI_HOME_DEADZONE;
  const diff = target - state.paddles.right.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

function movePaddles(
  state: DeepReadonly<CaromState>,
  input: InputFrame,
  dt: number,
): CaromState["paddles"] {
  const { left, right } = state.paddles;
  const solo = state.mode === "solo";
  const leftUp = solo ? Math.max(input.p1Up, input.p2Up) : input.p1Up;
  const leftDown = solo ? Math.max(input.p1Down, input.p2Down) : input.p1Down;
  const leftVy = left.driven
    ? left.drivenVy
    : (leftDown - leftUp) * PADDLE_SPEED;
  const rightVy = right.driven
    ? right.drivenVy
    : solo
      ? aiVelocity(state, dt)
      : (input.p2Down - input.p2Up) * PADDLE_SPEED;
  return {
    left: integratePaddle(left, leftVy, dt),
    right: integratePaddle(right, rightVy, dt),
  };
}

// ---- The ball --------------------------------------------------------------

/** The ball while a frame works on it. */
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

type Face = "left" | "right" | "top" | "bottom";

/**
 * Circle against an axis-aligned rectangle: when the ball's center is inside
 * the rectangle grown by BALL_R, places it off the struck face and says which
 * face that was. The velocity is the caller's to resolve.
 */
function pushOut(
  b: Body,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Face | null {
  const inside =
    b.x > x0 - BALL_R &&
    b.x < x1 + BALL_R &&
    b.y > y0 - BALL_R &&
    b.y < y1 + BALL_R;
  if (!inside) return null;
  const depths: [Face, number][] = [
    ["left", b.x - (x0 - BALL_R)],
    ["right", x1 + BALL_R - b.x],
    ["top", b.y - (y0 - BALL_R)],
    ["bottom", y1 + BALL_R - b.y],
  ];
  let face = depths[0];
  for (const candidate of depths) if (candidate[1] < face[1]) face = candidate;
  switch (face[0]) {
    case "left":
      b.x = x0 - BALL_R;
      break;
    case "right":
      b.x = x1 + BALL_R;
      break;
    case "top":
      b.y = y0 - BALL_R;
      break;
    case "bottom":
      b.y = y1 + BALL_R;
      break;
  }
  return face[0];
}

/** Reverses the velocity component normal to `face` if it points into it. */
function reflect(b: Body, face: Face): void {
  if (face === "left" && b.vx > 0) b.vx = -b.vx;
  else if (face === "right" && b.vx < 0) b.vx = -b.vx;
  else if (face === "top" && b.vy > 0) b.vy = -b.vy;
  else if (face === "bottom" && b.vy < 0) b.vy = -b.vy;
}

function resolveWalls(b: Body, cues: Set<CueName>): void {
  if (b.y - BALL_R < 0 && b.vy < 0) {
    b.y = BALL_R;
    b.vy = -b.vy;
    cues.add(CUES.wallBounce);
  } else if (b.y + BALL_R > FIELD_H && b.vy > 0) {
    b.y = FIELD_H - BALL_R;
    b.vy = -b.vy;
    cues.add(CUES.wallBounce);
  }
}

function paddleBounce(
  b: Body,
  paddle: DeepReadonly<PaddleState>,
  side: Side,
): void {
  const offset = clamp((b.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(b.vx, b.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  b.vx = dir * speed * Math.cos(theta);
  b.vy = speed * Math.sin(theta);
  b.spin = clamp(
    b.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  b.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

function resolvePaddle(
  b: Body,
  paddle: DeepReadonly<PaddleState>,
  side: Side,
  cues: Set<CueName>,
): void {
  const [x0, x1] = side === "left" ? [P1_X0, P1_X1] : [P2_X0, P2_X1];
  const face = pushOut(
    b,
    x0,
    paddle.cy - PADDLE_HALF,
    x1,
    paddle.cy + PADDLE_HALF,
  );
  if (face === null) return;
  if (face === "left" || face === "right") {
    paddleBounce(b, paddle, side);
    cues.add(CUES.paddleHit);
  } else {
    reflect(b, face);
    cues.add(CUES.wallBounce);
  }
}

function resolveObstacle(
  b: Body,
  obstacle: DeepReadonly<ObstacleState>,
  cues: Set<CueName>,
): void {
  const face = pushOut(
    b,
    obstacle.cx - OBSTACLE_HW,
    obstacle.cy - OBSTACLE_HH,
    obstacle.cx + OBSTACLE_HW,
    obstacle.cy + OBSTACLE_HH,
  );
  if (face === null) return;
  reflect(b, face);
  cues.add(CUES.obstacleBounce);
}

/** Advances a flying ball by `dt` in sub-steps, resolving every collision. */
function flyBall(
  ball: DeepReadonly<BallState>,
  state: DeepReadonly<CaromState>,
  dt: number,
  cues: Set<CueName>,
): BallState {
  const b: Body = { ...ball };
  const speed = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
  const h = dt / steps;
  const { left, right } = state.paddles;
  for (let i = 0; i < steps; i++) {
    const v = Math.hypot(b.vx, b.vy);
    if (v > 0) {
      const angle = (b.spin / v) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      [b.vx, b.vy] = [b.vx * cos - b.vy * sin, b.vx * sin + b.vy * cos];
    }
    b.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    resolveWalls(b, cues);
    resolvePaddle(b, left, "left", cues);
    resolvePaddle(b, right, "right", cues);
    for (const obstacle of state.obstacles) resolveObstacle(b, obstacle, cues);
  }
  return { ...ball, ...b };
}

function withTrailSample(
  ball: DeepReadonly<BallState>,
  simTime: number,
): BallState {
  const fresh: TrailSample = { x: ball.x, y: ball.y, t: simTime };
  const trail = [...ball.trail, fresh].filter(
    (s) => simTime - s.t <= TRAIL_TIME + TRAIL_EPSILON,
  );
  return { ...ball, trail };
}

/** Launches a held ball toward the receiver. */
function serve(ball: DeepReadonly<BallState>, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

// ---- Scoring ---------------------------------------------------------------

function matchWinner(score: CaromState["score"]): Side | null {
  const { p1, p2 } = score;
  if (p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD) return "left";
  if (p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD) return "right";
  return null;
}

function scoringSide(ball: DeepReadonly<BallState>): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** Awards the point to `scorer` and moves to the countdown or match over. */
function awardPoint(state: CaromState, scorer: Side, rng: Rng): CaromState {
  const score =
    scorer === "left"
      ? { ...state.score, p1: state.score.p1 + 1 }
      : { ...state.score, p2: state.score.p2 + 1 };
  const winner = matchWinner(score);
  if (winner) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: { ...parkedBall(rng), holdTimer: HOLD_TIME },
    screen: "countdown",
  };
}

// ---- The frame -------------------------------------------------------------

/**
 * Advances the screen the frame's input left the game on: nothing on a menu,
 * the hold on `countdown`, the live ball on `playing`.
 */
export function advanceMatch(
  state: DeepReadonly<CaromState>,
  input: InputFrame,
  dt: number,
  rng: Rng,
): Advance {
  if (state.screen !== "countdown" && state.screen !== "playing") {
    return { next: state as CaromState, cues: [] };
  }
  const moved: CaromState = {
    ...state,
    paddles: movePaddles(state, input, dt),
  };
  const { ball } = moved;
  if (!ball) return { next: moved, cues: [] };

  if (moved.screen === "countdown") {
    return { next: countdownFrame(moved, ball, dt), cues: [] };
  }
  if (ball.held) {
    return {
      next: { ...moved, ball: withTrailSample(ball, moved.simTime) },
      cues: [],
    };
  }

  const cues = new Set<CueName>();
  const flown = withTrailSample(flyBall(ball, moved, dt, cues), moved.simTime);
  const advanced: CaromState = { ...moved, ball: flown };
  const scorer = scoringSide(flown);
  if (scorer) {
    cues.add(CUES.score);
    return { next: awardPoint(advanced, scorer, rng), cues: orderCues(cues) };
  }
  return { next: advanced, cues: orderCues(cues) };
}

function countdownFrame(
  state: CaromState,
  ball: DeepReadonly<BallState>,
  dt: number,
): CaromState {
  if (!ball.held) return state;
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer <= 0) {
    return {
      ...state,
      screen: "playing",
      ball: serve(ball, state.receiver),
    };
  }
  return {
    ...state,
    ball: withTrailSample({ ...ball, holdTimer }, state.simTime),
  };
}

const CUE_ORDER: readonly CueName[] = [
  CUES.paddleHit,
  CUES.wallBounce,
  CUES.obstacleBounce,
  CUES.score,
];

function orderCues(cues: ReadonlySet<CueName>): CueName[] {
  return CUE_ORDER.filter((cue) => cues.has(cue));
}
