// Carom — the game. The state and the debug surface types live here; the
// simulation, the menus, the debug surface, and the drawing live beside it.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { createDebugApi } from "./debug";
import { runMenus } from "./menu";
import { drawGame } from "./render";
import { advanceMatch } from "./sim";
import { titleState } from "./world";
import { readInput } from "./input";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/** Where a pointer or touch contact landed on a menu, until it lifts. */
export interface MenuPress {
  readonly id: number;
  readonly index: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /** Menu contacts that have landed and not yet lifted (menu bookkeeping). */
  readonly menuPresses: readonly MenuPress[];
}

export type { CaromDebugApi } from "./debug";
import type { CaromDebugApi } from "./debug";

/** The field background; the letterbox bars match it. */
export const BACKGROUND = "#080b17";

const CUE_SPECS = {
  [CUES.paddleHit]: { wave: "square", freq: 440, freqTo: 330, durationMs: 70 },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 240,
    freqTo: 200,
    durationMs: 60,
  },
  [CUES.obstacleBounce]: {
    wave: "sawtooth",
    freq: 560,
    freqTo: 700,
    durationMs: 80,
    gain: 0.12,
  },
  [CUES.score]: { wave: "sine", freq: 520, freqTo: 120, durationMs: 320 },
} as const;

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }

    const diag = api.diagnostics;
    diag.register("screen", (s) => s.screen);
    diag.register("mode", (s) => s.mode);
    diag.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
    diag.register("ball pos", (s) =>
      s.ball ? `${s.ball.x.toFixed(1)}, ${s.ball.y.toFixed(1)}` : "-",
    );
    diag.register("ball vel", (s) =>
      s.ball ? `${s.ball.vx.toFixed(1)}, ${s.ball.vy.toFixed(1)}` : "-",
    );
    diag.register("ball speed", (s) =>
      s.ball ? Math.hypot(s.ball.vx, s.ball.vy) : "-",
    );
    diag.register("ball spin", (s) => (s.ball ? s.ball.spin : "-"));
    diag.register("left paddle", (s) => paddleLine(s.paddles.left));
    diag.register("right paddle", (s) => paddleLine(s.paddles.right));

    return [titleState(false), createDebugApi()];
  },

  update(
    state: DeepReadonly<CaromState>,
    api: UpdateApi,
    dt: number,
  ): CaromState {
    const input = readInput(api);
    const muted = input.mute ? !state.muted : state.muted;
    if (muted !== api.audio.muted()) api.audio.setMuted(muted);

    const timed = { ...state, simTime: state.simTime + dt };
    const afterMenus = runMenus(timed, input);
    const { next, cues } = advanceMatch(afterMenus, input, dt, Math.random);
    for (const cue of cues) api.audio.play(cue);
    return { ...next, muted: api.audio.muted() };
  },

  render(state: DeepReadonly<CaromState>, api: RenderApi): void {
    drawGame(api.ctx, state);
  },
};

function paddleLine(p: DeepReadonly<PaddleState>): string {
  return `${p.cy.toFixed(1)} @ ${p.vy.toFixed(1)}`;
}
