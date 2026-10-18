// One frame's worth of input, read once from the engine.

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";

export interface InputFrame {
  /** Held movement for each paddle's own keys (1 while held, else 0). */
  readonly p1Up: number;
  readonly p1Down: number;
  readonly p2Up: number;
  readonly p2Down: number;
  /** Press edges, each consumed by this read. */
  readonly upEdge: boolean;
  readonly downEdge: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly mute: boolean;
  /** Every pointer and touch sample delivered since the last frame. */
  readonly samples: readonly PointerSample[];
}

/** Reads every action and pointer sample the frame holds, exactly once. */
export function readInput(api: UpdateApi): InputFrame {
  const { input } = api;
  const p1UpEdge = input.pressed("p1-up");
  const p2UpEdge = input.pressed("p2-up");
  const p1DownEdge = input.pressed("p1-down");
  const p2DownEdge = input.pressed("p2-down");
  return {
    p1Up: input.value("p1-up"),
    p1Down: input.value("p1-down"),
    p2Up: input.value("p2-up"),
    p2Down: input.value("p2-down"),
    upEdge: p1UpEdge || p2UpEdge,
    downEdge: p1DownEdge || p2DownEdge,
    confirm: input.pressed("confirm"),
    back: input.pressed("back"),
    pause: input.pressed("pause"),
    mute: input.pressed("mute"),
    samples: input.pointerSamples(),
  };
}
