// Helpers for driving the game under test: the engine over an in-process
// canvas and a clock that supplies exact deltas, plus scripted input.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { createCanvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export type TestEngine = Engine<CaromState, CaromDebugApi>;

export interface Rig {
  readonly engine: TestEngine;
  readonly debug: CaromDebugApi;
  readonly cues: string[];
  /** Applies poses in order, each to the state the last one left. */
  pose(...poses: ((s: TestEngine["state"]) => CaromState)[]): void;
  frames(count: number): Promise<void>;
  /** Presses and releases `code` across one frame. */
  tap(code: string): Promise<void>;
  keyDown(code: string): void;
  keyUp(code: string): void;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    pointerType?: "mouse" | "touch",
    pointerId?: number,
  ): void;
}

/** A game over its own canvas, advanced `stepMs` per frame. */
export async function makeRig(stepMs = 1000 / 60): Promise<Rig> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();

  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));

  const key = (type: string, code: string) =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );

  const rig: Rig = {
    engine,
    debug: engine.debug,
    cues,
    pose(...poses) {
      for (const pose of poses) engine.apply(pose);
    },
    frames: (count) => engine.advance(count),
    async tap(code) {
      key("keydown", code);
      await engine.advance(1);
      key("keyup", code);
    },
    keyDown: (code) => void key("keydown", code),
    keyUp: (code) => void key("keyup", code),
    pointer(type, x, y, pointerType = "mouse", pointerId = 1) {
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId,
          pointerType,
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    },
  };
  return rig;
}
