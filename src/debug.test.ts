import { describe, expect, it } from "vitest";
import { OBSTACLE_CENTERS, TITLE_ITEMS } from "./constants";
import { makeRig } from "./testing";
import type { Rig } from "./testing";

const snap = (rig: Rig) => rig.debug.snapshot(rig.engine.state);

describe("the title state", () => {
  it("opens as specs/state.md states", async () => {
    const rig = await makeRig();
    const s = snap(rig);
    expect(s.version).toBe(1);
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.paddles.left).toEqual({
      cy: 360,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: 1,
      trail: [],
    });
    expect(s.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(false);
    expect(TITLE_ITEMS).toHaveLength(3);
  });
});

describe("poses", () => {
  it("sets each field alone and reads it back", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "paused"),
      (s) => debug.setMode(s, "versus"),
      (s) => debug.setMenuIndex(s, 2),
      (s) => debug.setTitleIndex(s, 1),
      (s) => debug.setResumeScreen(s, "countdown"),
      (s) => debug.setScore(s, 4, 7),
      (s) => debug.setWinner(s, "right"),
      (s) => debug.setReceiver(s, "right"),
      (s) => debug.setPaddleCy(s, "left", 123),
      (s) => debug.setPaddleVy(s, "right", -50),
      (s) => debug.setPaddleDriven(s, "right", true),
      (s) => debug.setBallPosition(s, 11, 22),
      (s) => debug.setBallVelocity(s, 30, 40),
      (s) => debug.setBallSpin(s, 5),
      (s) => debug.setBallHeld(s, false),
      (s) => debug.setBallHoldTimer(s, 0.25),
      (s) => debug.setBallServeSign(s, -1),
      (s) => debug.setAiTracking(s, false),
      (s) => debug.setAiMovement(s, false),
    );
    const s = snap(rig);
    expect(s).toMatchObject({
      screen: "paused",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 4, p2: 7 },
      winner: "right",
      receiver: "right",
      ai: { tracking: false, movement: false },
    });
    expect(s.paddles.left.cy).toBe(123);
    expect(s.paddles.left.driven).toBe(false);
    expect(s.paddles.right).toMatchObject({
      drivenVy: -50,
      driven: true,
      vy: 0,
    });
    expect(s.ball).toMatchObject({
      x: 11,
      y: 22,
      vx: 30,
      vy: 40,
      speed: 50,
      spin: 5,
      held: false,
      holdTimer: 0.25,
      serveSign: -1,
    });
    rig.pose((d) => debug.setWinner(d, null));
    expect(snap(rig).winner).toBeNull();
  });

  it("leaves the state it was handed untouched", async () => {
    const rig = await makeRig();
    const before = rig.engine.state;
    const copy = JSON.stringify(before);
    rig.debug.setScore(before, 3, 3);
    rig.debug.clearWorld(before);
    rig.debug.reset(before);
    expect(JSON.stringify(before)).toBe(copy);
  });

  it("draws serve signs of both kinds", async () => {
    const rig = await makeRig();
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      rig.pose((s) => rig.debug.drawBallServeSign(s));
      seen.add(snap(rig).ball?.serveSign ?? 0);
    }
    expect(seen).toEqual(new Set([1, -1]));
  });
});

describe("the world", () => {
  it("clears and respawns the ball and obstacles", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose((s) => debug.clearWorld(s));
    expect(snap(rig).ball).toBeNull();
    expect(snap(rig).obstacles).toEqual([]);
    rig.pose((s) => debug.spawnObstacle(s, 1));
    rig.pose((s) => debug.spawnObstacle(s, 0));
    rig.pose((s) => debug.spawnObstacle(s, 0));
    expect(snap(rig).obstacles.map((o) => o.index)).toEqual([0, 1]);
    rig.pose((s) => debug.spawnBall(s));
    expect(snap(rig).ball).toMatchObject({ x: 640, held: true, holdTimer: 1 });
  });

  it("takes no part in a frame without a ball", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.clearWorld(s),
    );
    await rig.frames(30);
    expect(snap(rig).ball).toBeNull();
    expect(snap(rig).score).toEqual({ p1: 0, p2: 0 });
    rig.pose((s) => debug.setScreen(s, "countdown"));
    await rig.frames(5);
    expect(snap(rig).ball).toBeNull();
  });

  it("fails loudly where there is nothing to act on", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    const state = rig.engine.state;
    expect(() => debug.spawnObstacle(state, 2)).toThrow();
    expect(() => debug.setScreen(state, "nope" as never)).toThrow();
    expect(() => debug.setMode(state, "nope" as never)).toThrow();
    expect(() => debug.setResumeScreen(state, "paused" as never)).toThrow();
    expect(() => debug.setPaddleCy(state, "middle" as never, 1)).toThrow();
    expect(() => debug.setScore(state, Number.NaN, 1)).toThrow();
    expect(() => debug.setBallServeSign(state, 2 as never)).toThrow();
    const empty = debug.clearWorld(state);
    expect(() => debug.setBallPosition(empty, 1, 1)).toThrow(/needs a ball/);
    expect(() => debug.setBallVelocity(empty, 1, 1)).toThrow();
    expect(() => debug.setBallSpin(empty, 1)).toThrow();
    expect(() => debug.setBallHeld(empty, true)).toThrow();
    expect(() => debug.setBallHoldTimer(empty, 1)).toThrow();
    expect(() => debug.setBallServeSign(empty, 1)).toThrow();
    expect(() => debug.drawBallServeSign(empty)).toThrow();
  });

  it("resets to the title state, keeping the mute bit", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.setScore(s, 5, 5),
      (s) => debug.setPaddleDriven(s, "left", true),
      (s) => debug.setAiTracking(s, false),
      (s) => debug.clearWorld(s),
      (s) => debug.setMuted(s, true),
      (s) => debug.setTitleIndex(s, 2),
    );
    await rig.frames(5);
    rig.pose((s) => debug.reset(s));
    const s = snap(rig);
    expect(s.screen).toBe("title");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.paddles.left.driven).toBe(false);
    expect(s.ai.tracking).toBe(true);
    expect(s.ball).not.toBeNull();
    expect(s.obstacles).toHaveLength(2);
    expect(s.simTime).toBe(0);
    expect(s.titleIndex).toBe(0);
    expect(s.muted).toBe(true);
  });

  it("reconciles without changing anything", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose((s) => debug.setBallVelocity(s, 3, 4));
    const before = snap(rig);
    rig.pose((s) => debug.reconcile(s));
    rig.pose((s) => debug.reconcile(s));
    expect(snap(rig)).toEqual(before);
    expect(snap(rig).ball?.speed).toBe(5);
  });
});

describe("sound", () => {
  it("toggles with M on any screen and mirrors into the state", async () => {
    const rig = await makeRig();
    await rig.tap("KeyM");
    expect(snap(rig).muted).toBe(true);
    await rig.tap("KeyM");
    expect(snap(rig).muted).toBe(false);
  });

  it("applies a posed mute bit to the runtime", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose((s) => debug.setMuted(s, true));
    expect(snap(rig).muted).toBe(true);
    await rig.frames(2);
    expect(snap(rig).muted).toBe(true);
    await rig.tap("KeyM");
    expect(snap(rig).muted).toBe(false);
  });

  it("plays a cue only once per frame however many sub-steps raised it", async () => {
    const rig = await makeRig(100);
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.setBallHeld(s, false),
      (s) => debug.setBallPosition(s, 640, 100),
      (s) => debug.setBallVelocity(s, 0, -980),
    );
    await rig.frames(1);
    expect(rig.cues.filter((c) => c === "wall-bounce")).toHaveLength(1);
  });
});

describe("diagnostics and rendering", () => {
  it("registers the facts the snapshot reports", async () => {
    const rig = await makeRig();
    const names = rig.engine.diagnostics().map((d) => d.name);
    for (const name of [
      "screen",
      "mode",
      "score",
      "ball pos",
      "ball speed",
      "left paddle",
    ]) {
      expect(names).toContain(name);
    }
    expect(rig.engine.diagnostics().every((d) => d.error === undefined)).toBe(
      true,
    );
    rig.pose((s) => rig.debug.clearWorld(s));
    const readings = rig.engine.diagnostics();
    expect(readings.find((d) => d.name === "ball pos")?.value).toBe("-");
  });

  it("draws every screen without error", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      rig.pose((s) => debug.setScreen(s, screen));
      await rig.frames(2);
    }
    rig.pose(
      (s) => debug.setMode(s, "versus"),
      (s) => debug.setWinner(s, "right"),
    );
    await rig.frames(2);
    rig.pose(
      (s) => debug.setWinner(s, null),
      (s) => debug.clearWorld(s),
    );
    await rig.frames(2);
    expect(snap(rig).screen).toBe("matchover");
  });
});
