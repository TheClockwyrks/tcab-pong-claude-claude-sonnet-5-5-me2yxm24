import { describe, expect, it } from "vitest";
import { FIELD_CX, HOLD_TIME } from "./constants";
import { makeRig } from "./testing";
import type { Rig } from "./testing";

const snap = (rig: Rig) => rig.debug.snapshot(rig.engine.state);

function center(rig: Rig, index: number): [number, number] {
  const r = rig.debug.menuItemRect(rig.engine.state, index);
  if (!r) throw new Error(`no item ${index}`);
  return [r.x + r.w / 2, r.y + r.h / 2];
}

describe("title keyboard navigation", () => {
  it("wraps the highlight both ways", async () => {
    const rig = await makeRig();
    await rig.tap("KeyW");
    expect(snap(rig).menuIndex).toBe(2);
    await rig.tap("KeyS");
    expect(snap(rig).menuIndex).toBe(0);
    await rig.tap("ArrowDown");
    await rig.tap("ArrowDown");
    expect(snap(rig).menuIndex).toBe(2);
  });

  it("starts Solo and Versus, remembering the title selection", async () => {
    const rig = await makeRig();
    await rig.tap("KeyS");
    await rig.tap("Space");
    const s = snap(rig);
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.titleIndex).toBe(1);
    expect(s.menuIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.ball?.holdTimer).toBeLessThan(HOLD_TIME);
  });

  it("does nothing on back, and opens and leaves how-to", async () => {
    const rig = await makeRig();
    await rig.tap("Escape");
    expect(snap(rig).screen).toBe("title");
    await rig.tap("KeyW");
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("howto");
    expect(snap(rig).menuIndex).toBe(0);
    await rig.tap("Escape");
    expect(snap(rig).screen).toBe("title");
    expect(snap(rig).menuIndex).toBe(2);
    await rig.tap("Enter");
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("title");
  });

  it("applies up before down and movement before confirm", async () => {
    const rig = await makeRig();
    rig.keyDown("KeyS");
    rig.keyDown("KeyW");
    await rig.frames(1);
    expect(snap(rig).menuIndex).toBe(2);
    rig.keyUp("KeyS");
    rig.keyUp("KeyW");
    rig.keyDown("KeyS");
    rig.keyDown("Enter");
    await rig.frames(1);
    expect(snap(rig).screen).toBe("title");
    expect(snap(rig).menuIndex).toBe(0);
  });
});

describe("pause", () => {
  async function playing() {
    const rig = await makeRig();
    await rig.tap("Enter");
    return rig;
  }

  it("opens on a single Escape, freezes the field, and resumes on the next", async () => {
    const rig = await playing();
    const before = snap(rig);
    await rig.tap("Escape");
    const paused = snap(rig);
    expect(paused.screen).toBe("paused");
    expect(paused.resumeScreen).toBe("countdown");
    expect(paused.ball?.holdTimer).toBe(before.ball?.holdTimer);
    await rig.frames(30);
    expect(snap(rig).ball?.holdTimer).toBe(before.ball?.holdTimer);
    expect(snap(rig).simTime).toBeGreaterThan(paused.simTime);
    await rig.tap("Escape");
    expect(snap(rig).screen).toBe("countdown");
  });

  it("resumes on P, and navigates RESTART and QUIT TO MENU", async () => {
    const rig = await playing();
    await rig.tap("KeyP");
    await rig.tap("KeyP");
    expect(snap(rig).screen).toBe("countdown");
    await rig.tap("KeyP");
    await rig.tap("KeyS");
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).ball?.holdTimer).toBeGreaterThan(0.9);
    await rig.tap("KeyP");
    await rig.tap("KeyW");
    expect(snap(rig).menuIndex).toBe(2);
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("title");
  });

  it("resumes with RESUME", async () => {
    const rig = await playing();
    await rig.tap("KeyP");
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("countdown");
  });
});

describe("match over", () => {
  async function over() {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "matchover"),
      (s) => debug.setScore(s, 11, 5),
      (s) => debug.setWinner(s, "left"),
    );
    return rig;
  }

  it("plays again with a clean match", async () => {
    const rig = await over();
    await rig.tap("Enter");
    const s = snap(rig);
    expect(s.screen).toBe("countdown");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.winner).toBeNull();
  });

  it("returns to the title from MENU and from back", async () => {
    const rig = await over();
    await rig.tap("KeyS");
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("title");
    expect(snap(rig).score).toEqual({ p1: 0, p2: 0 });
    const again = await over();
    await again.tap("Escape");
    expect(snap(again).screen).toBe("title");
  });
});

describe("pointer and touch", () => {
  it("selects on hover and confirms on press and release in one item", async () => {
    const rig = await makeRig();
    const [x, y] = center(rig, 1);
    rig.pointer("pointermove", x, y);
    await rig.frames(1);
    expect(snap(rig).menuIndex).toBe(1);
    rig.pointer("pointerdown", x, y);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("title");
    rig.pointer("pointerup", x, y);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).mode).toBe("versus");
    expect(snap(rig).titleIndex).toBe(1);
  });

  it("confirms when the press and release arrive on one frame", async () => {
    const rig = await makeRig();
    const [x, y] = center(rig, 2);
    rig.pointer("pointerdown", x, y);
    rig.pointer("pointerup", x, y);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("howto");
  });

  it("confirms nothing when the edges fall in different regions", async () => {
    const rig = await makeRig();
    const [x0, y0] = center(rig, 0);
    const [x1, y1] = center(rig, 1);
    rig.pointer("pointerdown", x0, y0);
    await rig.frames(1);
    rig.pointer("pointerup", x1, y1);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("title");
    rig.pointer("pointerdown", 5, 5);
    rig.pointer("pointerup", x1, y1);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("title");
  });

  it("selects on a touch landing, then confirms on lift", async () => {
    const rig = await makeRig();
    const [x, y] = center(rig, 1);
    rig.pointer("pointerdown", x, y, "touch", 7);
    await rig.frames(1);
    expect(snap(rig).menuIndex).toBe(1);
    rig.pointer("pointerup", x, y, "touch", 7);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("countdown");
  });

  it("lets a pointer selection override a keyboard move on the same frame", async () => {
    const rig = await makeRig();
    const [x, y] = center(rig, 2);
    rig.keyDown("KeyS");
    rig.pointer("pointermove", x, y);
    await rig.frames(1);
    expect(snap(rig).menuIndex).toBe(2);
  });

  it("confirms the keyboard's item alone when both confirm", async () => {
    const rig = await makeRig();
    const [x, y] = center(rig, 2);
    rig.keyDown("Enter");
    rig.pointer("pointerdown", x, y);
    rig.pointer("pointerup", x, y);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).mode).toBe("solo");
  });

  it("works on the pause and match-over menus", async () => {
    const rig = await makeRig();
    await rig.tap("Enter");
    await rig.tap("KeyP");
    const [x, y] = center(rig, 2);
    rig.pointer("pointerdown", x, y);
    rig.pointer("pointerup", x, y);
    await rig.frames(1);
    expect(snap(rig).screen).toBe("title");
    expect(snap(rig).menuIndex).toBe(0);
  });
});

describe("menuItemRect", () => {
  it("reports each menu's regions and null elsewhere", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    const rect = debug.menuItemRect(rig.engine.state, 0);
    expect(rect && rect.x + rect.w / 2).toBe(FIELD_CX);
    expect(debug.menuItemRect(rig.engine.state, 3)).toBeNull();
    expect(debug.menuItemRect(rig.engine.state, -1)).toBeNull();
    for (const screen of ["countdown", "playing"] as const) {
      rig.pose((s) => debug.setScreen(s, screen));
      expect(debug.menuItemRect(rig.engine.state, 0)).not.toBe(undefined);
      expect(debug.menuItemRect(rig.engine.state, 0)).toBeNull();
    }
    rig.pose((s) => debug.setScreen(s, "howto"));
    expect(debug.menuItemRect(rig.engine.state, 0)).not.toBeNull();
    expect(debug.menuItemRect(rig.engine.state, 1)).toBeNull();
  });
});
