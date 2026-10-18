// The debug and automation surface (specs/instrumentation.md). Every operation
// takes the current state first: a pose returns the next state, a reading
// returns what it read.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuRect } from "./menu";
import type { MenuRect } from "./menu";
import { allObstacles, drawServeSign, obstacleAt, parkedBall } from "./world";
import { titleState } from "./world";

type State = DeepReadonly<CaromState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

export interface BallSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: { x: number; y: number; t: number }[];
}

export interface PaddleSnapshot {
  cy: number;
  vy: number;
  drivenVy: number;
  driven: boolean;
}

export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: { left: PaddleSnapshot; right: PaddleSnapshot };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: BallSnapshot | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

export interface CaromDebugApi {
  readonly version: number;
  clearWorld(state: State): CaromState;
  spawnBall(state: State): CaromState;
  spawnObstacle(state: State, index: number): CaromState;
  reset(state: State): CaromState;
  reconcile(state: State): CaromState;
  setScreen(state: State, screen: Screen): CaromState;
  setMode(state: State, mode: Mode): CaromState;
  setMenuIndex(state: State, index: number): CaromState;
  setTitleIndex(state: State, index: number): CaromState;
  setResumeScreen(state: State, screen: "countdown" | "playing"): CaromState;
  setScore(state: State, p1: number, p2: number): CaromState;
  setWinner(state: State, side: Side | null): CaromState;
  setReceiver(state: State, side: Side): CaromState;
  setPaddleCy(state: State, side: Side, cy: number): CaromState;
  setPaddleVy(state: State, side: Side, vy: number): CaromState;
  setPaddleDriven(state: State, side: Side, driven: boolean): CaromState;
  setBallPosition(state: State, x: number, y: number): CaromState;
  setBallVelocity(state: State, vx: number, vy: number): CaromState;
  setBallSpin(state: State, spin: number): CaromState;
  setBallHeld(state: State, held: boolean): CaromState;
  setBallHoldTimer(state: State, seconds: number): CaromState;
  setBallServeSign(state: State, sign: 1 | -1): CaromState;
  drawBallServeSign(state: State): CaromState;
  setAiTracking(state: State, enabled: boolean): CaromState;
  setAiMovement(state: State, enabled: boolean): CaromState;
  setMuted(state: State, muted: boolean): CaromState;
  snapshot(state: State): CaromSnapshot;
  menuItemRect(state: State, index: number): MenuRect | null;
}

function finite(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Carom debug: ${what} must be a finite number`);
  }
  return value;
}

function checkSide(side: Side): Side {
  if (side !== "left" && side !== "right") {
    throw new RangeError(`Carom debug: unknown side ${String(side)}`);
  }
  return side;
}

function requireBall(state: State, operation: string): BallState {
  if (!state.ball) {
    throw new Error(
      `Carom debug: ${operation} needs a ball, and none is on the field`,
    );
  }
  return state.ball;
}

function withBall(
  state: State,
  operation: string,
  change: Partial<BallState>,
): CaromState {
  return { ...state, ball: { ...requireBall(state, operation), ...change } };
}

function withPaddle(
  state: State,
  side: Side,
  change: Partial<PaddleState>,
): CaromState {
  const key = checkSide(side);
  return {
    ...state,
    paddles: { ...state.paddles, [key]: { ...state.paddles[key], ...change } },
  };
}

function snapshotBall(ball: State["ball"]): BallSnapshot | null {
  if (!ball) return null;
  return {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    speed: Math.hypot(ball.vx, ball.vy),
    spin: ball.spin,
    held: ball.held,
    holdTimer: ball.holdTimer,
    serveSign: ball.serveSign,
    trail: ball.trail.map(({ x, y, t }) => ({ x, y, t })),
  };
}

function snapshotPaddle(p: State["paddles"]["left"]): PaddleSnapshot {
  return { cy: p.cy, vy: p.vy, drivenVy: p.drivenVy, driven: p.driven };
}

/** Builds the debug surface `initialize` returns beside the state. */
export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),

    spawnBall: (s) => ({ ...s, ball: parkedBall(Math.random) }),

    spawnObstacle: (s, index) => {
      const placed = obstacleAt(index);
      const others = s.obstacles.filter((o) => o.index !== index);
      const obstacles = [...others, placed].sort((a, b) => a.index - b.index);
      return { ...s, obstacles };
    },

    reset: (s) => ({ ...titleState(s.muted), obstacles: allObstacles() }),

    reconcile: (s) => ({ ...s }),

    setScreen: (s, screen) => {
      if (!SCREENS.includes(screen)) {
        throw new RangeError(`Carom debug: unknown screen ${String(screen)}`);
      }
      return { ...s, screen };
    },
    setMode: (s, mode) => {
      if (mode !== "solo" && mode !== "versus") {
        throw new RangeError(`Carom debug: unknown mode ${String(mode)}`);
      }
      return { ...s, mode };
    },
    setMenuIndex: (s, menuIndex) => ({
      ...s,
      menuIndex: finite(menuIndex, "menu index"),
    }),
    setTitleIndex: (s, titleIndex) => ({
      ...s,
      titleIndex: finite(titleIndex, "title index"),
    }),
    setResumeScreen: (s, resumeScreen) => {
      if (resumeScreen !== "countdown" && resumeScreen !== "playing") {
        throw new RangeError(
          `Carom debug: cannot resume to ${String(resumeScreen)}`,
        );
      }
      return { ...s, resumeScreen };
    },

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: finite(p1, "score"), p2: finite(p2, "score") },
    }),
    setWinner: (s, winner) => ({
      ...s,
      winner: winner === null ? null : checkSide(winner),
    }),
    setReceiver: (s, side) => ({ ...s, receiver: checkSide(side) }),

    setPaddleCy: (s, side, cy) =>
      withPaddle(s, side, { cy: finite(cy, "paddle center") }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: finite(vy, "paddle velocity") }),
    setPaddleDriven: (s, side, driven) => withPaddle(s, side, { driven }),

    setBallPosition: (s, x, y) =>
      withBall(s, "setBallPosition", {
        x: finite(x, "ball x"),
        y: finite(y, "ball y"),
      }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, "setBallVelocity", {
        vx: finite(vx, "ball vx"),
        vy: finite(vy, "ball vy"),
      }),
    setBallSpin: (s, spin) =>
      withBall(s, "setBallSpin", { spin: finite(spin, "ball spin") }),
    setBallHeld: (s, held) => withBall(s, "setBallHeld", { held }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, "setBallHoldTimer", {
        holdTimer: finite(seconds, "hold timer"),
      }),
    setBallServeSign: (s, sign) => {
      if (sign !== 1 && sign !== -1) {
        throw new RangeError(`Carom debug: serve sign must be 1 or -1`);
      }
      return withBall(s, "setBallServeSign", { serveSign: sign });
    },
    drawBallServeSign: (s) => {
      requireBall(s, "drawBallServeSign");
      return withBall(s, "drawBallServeSign", {
        serveSign: drawServeSign(Math.random),
      });
    },

    setAiTracking: (s, tracking) => ({ ...s, ai: { ...s.ai, tracking } }),
    setAiMovement: (s, movement) => ({ ...s, ai: { ...s.ai, movement } }),

    setMuted: (s, muted) => ({ ...s, muted }),

    snapshot: (s) => ({
      version: CAROM_DEBUG_VERSION,
      screen: s.screen,
      mode: s.mode,
      menuIndex: s.menuIndex,
      titleIndex: s.titleIndex,
      resumeScreen: s.resumeScreen,
      score: { p1: s.score.p1, p2: s.score.p2 },
      winner: s.winner,
      muted: s.muted,
      paddles: {
        left: snapshotPaddle(s.paddles.left),
        right: snapshotPaddle(s.paddles.right),
      },
      ai: { tracking: s.ai.tracking, movement: s.ai.movement },
      receiver: s.receiver,
      ball: snapshotBall(s.ball),
      obstacles: s.obstacles.map(({ index, cx, cy }) => ({ index, cx, cy })),
      simTime: s.simTime,
    }),

    menuItemRect: (s, index) => menuRect(s.screen, index),
  };
}
