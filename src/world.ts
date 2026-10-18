// Builders for the states the game starts, parks, and returns to.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

export type Rng = () => number;

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(rng: Rng): 1 | -1 {
  return rng() < 0.5 ? -1 : 1;
}

/** The ball at its home point, waiting to be served. */
export function parkedBall(rng: Rng): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(rng),
    trail: [],
  };
}

/** Obstacle `index` standing at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (!center) throw new RangeError(`Carom: no obstacle with index ${index}`);
  return { index, cx: center.x, cy: center.y };
}

export function allObstacles(): readonly ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

export function centeredPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The title-screen state, with `muted` carried in from the runtime. */
export function titleState(muted: boolean, rng: Rng = Math.random): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: centeredPaddle(), right: centeredPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(rng),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    menuPresses: [],
  };
}

/** Back to the title: every title value but the three the player keeps. */
export function returnToTitle(
  state: DeepReadonly<CaromState>,
  rng: Rng = Math.random,
): CaromState {
  return {
    ...titleState(state.muted, rng),
    menuIndex: state.titleIndex,
    titleIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

/** Starts a match in `mode`: scores cleared, ball parked, paddles centered. */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
  rng: Rng = Math.random,
): CaromState {
  const { left, right } = state.paddles;
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(rng),
    paddles: {
      left: { ...left, cy: FIELD_CY, vy: 0 },
      right: { ...right, cy: FIELD_CY, vy: 0 },
    },
    menuPresses: [],
  };
}
