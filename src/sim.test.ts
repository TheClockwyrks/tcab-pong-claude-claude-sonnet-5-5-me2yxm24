import { describe, expect, it } from "vitest";
import {
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_SPEED,
  SPEED_CAP,
  TRAIL_TIME,
} from "./constants";
import { makeRig } from "./testing";
import type { Rig } from "./testing";

/** A solo match with the field cleared of obstacles and the AI idle. */
async function liveRig(stepMs = 1000 / 60): Promise<Rig> {
  const rig = await makeRig(stepMs);
  const { debug } = rig;
  rig.pose(
    (s) => debug.setScreen(s, "playing"),
    (s) => debug.setBallHeld(s, false),
    (s) => debug.setAiMovement(s, false),
    (s) => debug.clearWorld(s),
    (s) => debug.spawnBall(s),
    (s) => debug.setBallHeld(s, false),
  );
  return rig;
}

const snap = (rig: Rig) => rig.debug.snapshot(rig.engine.state);

function ball(rig: Rig) {
  const b = snap(rig).ball;
  if (!b) throw new Error("no ball");
  return b;
}

describe("serving", () => {
  it("holds the ball for HOLD_TIME, then serves it toward the left", async () => {
    const rig = await makeRig();
    await rig.tap("Enter");
    expect(snap(rig).screen).toBe("countdown");
    expect(ball(rig).held).toBe(true);
    await rig.frames(50);
    expect(snap(rig).screen).toBe("countdown");
    await rig.frames(15);
    const b = ball(rig);
    expect(snap(rig).screen).toBe("playing");
    expect(b.held).toBe(false);
    expect(b.holdTimer).toBe(0);
    expect(b.speed).toBeCloseTo(SERVE_SPEED, 6);
    expect(b.vx).toBeLessThan(0);
    expect(Math.sign(b.vy)).toBe(b.serveSign);
    expect(HOLD_TIME).toBe(1);
  });

  it("serves toward the receiver on the right", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "countdown"),
      (s) => debug.setReceiver(s, "right"),
      (s) => debug.setBallHoldTimer(s, 0),
    );
    await rig.frames(1);
    expect(snap(rig).screen).toBe("playing");
    expect(ball(rig).vx).toBeGreaterThan(0);
  });

  it("serves with the serve sign it holds", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "countdown"),
      (s) => debug.setBallServeSign(s, -1),
      (s) => debug.setBallHoldTimer(s, 0),
    );
    await rig.frames(1);
    expect(ball(rig).vy).toBeLessThan(0);
    expect(ball(rig).serveSign).toBe(-1);
  });

  it("does not advance the ball on the frame it is served", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "countdown"),
      (s) => debug.setBallHoldTimer(s, 0.001),
    );
    await rig.frames(1);
    expect(ball(rig).x).toBe(640);
    expect(ball(rig).trail).toEqual([]);
  });
});

describe("walls", () => {
  it("reflects off the top and bottom walls, with a cue", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, 640, 20),
      (s) => debug.setBallVelocity(s, 100, -400),
    );
    await rig.frames(3);
    expect(ball(rig).vy).toBeGreaterThan(0);
    expect(rig.cues).toContain(CUES.wallBounce);
    rig.pose(
      (s) => debug.setBallPosition(s, 640, FIELD_H - 20),
      (s) => debug.setBallVelocity(s, 100, 400),
    );
    await rig.frames(3);
    expect(ball(rig).vy).toBeLessThan(0);
    expect(ball(rig).y).toBeLessThanOrEqual(FIELD_H - BALL_R);
  });
});

describe("paddles", () => {
  it("moves a human paddle at PADDLE_SPEED and clamps it", async () => {
    const rig = await liveRig();
    rig.keyDown("KeyW");
    await rig.frames(6);
    expect(snap(rig).paddles.left.vy).toBeCloseTo(-720, 6);
    expect(snap(rig).paddles.left.cy).toBeCloseTo(FIELD_CY - 72, 4);
    await rig.frames(120);
    expect(snap(rig).paddles.left.cy).toBe(PADDLE_MIN_CY);
    expect(snap(rig).paddles.left.vy).toBe(0);
    rig.keyUp("KeyW");
    rig.keyDown("KeyS");
    await rig.frames(200);
    expect(snap(rig).paddles.left.cy).toBe(PADDLE_MAX_CY);
  });

  it("lets player two's keys move the left paddle in Solo only", async () => {
    const rig = await liveRig();
    rig.keyDown("ArrowUp");
    await rig.frames(3);
    expect(snap(rig).paddles.left.cy).toBeLessThan(FIELD_CY);
    expect(snap(rig).paddles.right.cy).toBe(FIELD_CY);
    rig.keyUp("ArrowUp");

    const versus = await liveRig();
    versus.pose((s) => versus.debug.setMode(s, "versus"));
    versus.keyDown("ArrowUp");
    await versus.frames(3);
    expect(snap(versus).paddles.left.cy).toBe(FIELD_CY);
    expect(snap(versus).paddles.right.cy).toBeLessThan(FIELD_CY);
  });

  it("moves a driven paddle at its drivenVy and ignores the keys", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleVy(s, "left", 300),
      (s) => debug.setPaddleDriven(s, "left", true),
    );
    rig.keyDown("KeyW");
    await rig.frames(1);
    expect(snap(rig).paddles.left.vy).toBe(300);
    expect(snap(rig).paddles.right.driven).toBe(false);
  });
});

describe("paddle bounce and spin", () => {
  it("sends a center hit straight across and speeds the ball up", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, 100, FIELD_CY),
      (s) => debug.setBallVelocity(s, -500, 0),
    );
    await rig.frames(10);
    const b = ball(rig);
    expect(b.vx).toBeCloseTo(520, 6);
    expect(b.vy).toBeCloseTo(0, 6);
    expect(b.spin).toBe(0);
    expect(rig.cues).toContain(CUES.paddleHit);
  });

  it("angles an edge hit and caps the speed", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleCy(s, "left", FIELD_CY - 55),
      (s) => debug.setBallPosition(s, 100, FIELD_CY),
      (s) => debug.setBallVelocity(s, -SPEED_CAP, 0),
    );
    await rig.frames(4);
    const b = ball(rig);
    expect(b.speed).toBeCloseTo(SPEED_CAP, 6);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });

  it("adds spin from the paddle's motion and curves the flight", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleVy(s, "left", 400),
      (s) => debug.setPaddleDriven(s, "left", true),
      (s) => debug.setBallPosition(s, 100, FIELD_CY),
      (s) => debug.setBallVelocity(s, -500, 0),
    );
    await rig.frames(8);
    const b = ball(rig);
    expect(b.spin).toBeGreaterThan(200);
    expect(b.spin).toBeLessThanOrEqual(900);
  });

  it("places the ball in front of the paddle face", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, P1_X1 + 5, FIELD_CY),
      (s) => debug.setBallVelocity(s, -100, 0),
      (s) => debug.setPaddleDriven(s, "left", true),
    );
    await rig.frames(1);
    expect(ball(rig).x).toBeGreaterThanOrEqual(P1_X1 + BALL_R);
    rig.pose(
      (s) => debug.setBallPosition(s, P2_X0 - 5, FIELD_CY),
      (s) => debug.setBallVelocity(s, 100, 0),
    );
    await rig.frames(1);
    expect(ball(rig).x).toBeLessThanOrEqual(P2_X0 - BALL_R);
    expect(ball(rig).vx).toBeLessThan(0);
  });

  it("treats a paddle end cap like a wall", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleCy(s, "left", 200),
      (s) => debug.setBallPosition(s, 56, 200 + 55 + BALL_R + 2),
      (s) => debug.setBallVelocity(s, 0, -300),
    );
    await rig.frames(2);
    expect(ball(rig).vy).toBeGreaterThan(0);
    expect(rig.cues).toContain(CUES.wallBounce);
    expect(rig.cues).not.toContain(CUES.paddleHit);
  });
});

describe("obstacles", () => {
  it("bounces the ball off an obstacle without changing speed", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.spawnObstacle(s, 0),
      (s) => debug.setBallPosition(s, 440, 220),
      (s) => debug.setBallVelocity(s, 400, 0),
    );
    await rig.frames(10);
    const b = ball(rig);
    expect(b.vx).toBeCloseTo(-400, 6);
    expect(b.speed).toBeCloseTo(400, 6);
    expect(rig.cues).toContain(CUES.obstacleBounce);
  });

  it("deflects off an obstacle's top face", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.spawnObstacle(s, 1),
      (s) => debug.setBallPosition(s, 790, 400),
      (s) => debug.setBallVelocity(s, 0, 300),
    );
    await rig.frames(10);
    expect(ball(rig).vy).toBeLessThan(0);
  });

  it("ignores an obstacle that is absent", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, 440, 220),
      (s) => debug.setBallVelocity(s, 400, 0),
    );
    await rig.frames(20);
    expect(ball(rig).vx).toBe(400);
  });
});

describe("spin", () => {
  it("turns the velocity without changing speed, and decays", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, 640, FIELD_CY),
      (s) => debug.setBallVelocity(s, 300, 0),
      (s) => debug.setBallSpin(s, 600),
    );
    await rig.frames(30);
    const b = ball(rig);
    expect(b.speed).toBeCloseTo(300, 6);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.spin).toBeCloseTo(600 * Math.pow(0.5, 0.5 / 0.8), 4);
  });
});

describe("trail", () => {
  it("records the last TRAIL_TIME of travel", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setBallPosition(s, 300, 300),
      (s) => debug.setBallVelocity(s, 100, 0),
    );
    await rig.frames(30);
    const { trail } = ball(rig);
    const now = snap(rig).simTime;
    expect(trail.length).toBeGreaterThan(5);
    expect(trail.length).toBeLessThanOrEqual(9);
    for (const sample of trail)
      expect(now - sample.t).toBeLessThanOrEqual(TRAIL_TIME + 1e-6);
    expect(trail[trail.length - 1]?.t).toBeCloseTo(now, 9);
  });
});

describe("scoring", () => {
  it("scores for player one when the ball leaves the right edge", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleCy(s, "right", 100),
      (s) => debug.setBallPosition(s, FIELD_W - 30, 600),
      (s) => debug.setBallVelocity(s, 600, 0),
    );
    await rig.frames(10);
    const s = snap(rig);
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.holdTimer).toBeLessThanOrEqual(HOLD_TIME);
    expect(s.ball?.holdTimer).toBeGreaterThan(0.5);
    expect(rig.cues).toContain(CUES.score);
  });

  it("scores for player two when the ball leaves the left edge", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setPaddleCy(s, "left", 600),
      (s) => debug.setBallPosition(s, 30, 100),
      (s) => debug.setBallVelocity(s, -600, 0),
    );
    await rig.frames(10);
    expect(snap(rig).score).toEqual({ p1: 0, p2: 1 });
    expect(snap(rig).receiver).toBe("left");
  });

  async function pointFor(rig: Rig, p1: number, p2: number) {
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScore(s, p1, p2),
      (s) => debug.setPaddleCy(s, "right", 100),
      (s) => debug.setBallPosition(s, FIELD_W - 30, 600),
      (s) => debug.setBallVelocity(s, 600, 0),
    );
    await rig.frames(10);
  }

  it("ends the match at 11 with a two-point lead", async () => {
    const rig = await liveRig();
    await pointFor(rig, 10, 4);
    const s = snap(rig);
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    expect(s.menuIndex).toBe(0);
    expect(s.score.p1).toBe(11);
  });

  it("plays on at 10-10 until one side leads by two", async () => {
    const rig = await liveRig();
    await pointFor(rig, 10, 10);
    expect(snap(rig).screen).toBe("countdown");
    expect(snap(rig).winner).toBeNull();
    const again = await liveRig();
    await pointFor(again, 11, 10);
    expect(snap(again).winner).toBe("left");
    const done = await liveRig();
    await pointFor(done, 11, 9);
    expect(snap(done).winner).toBe("left");
  });

  it("gives player two the win by the same rule", async () => {
    const rig = await liveRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScore(s, 3, 10),
      (s) => debug.setPaddleCy(s, "left", 600),
      (s) => debug.setBallPosition(s, 30, 100),
      (s) => debug.setBallVelocity(s, -600, 0),
    );
    await rig.frames(10);
    expect(snap(rig).winner).toBe("right");
  });
});

describe("the AI", () => {
  it("returns home when there is nothing to defend", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.setPaddleCy(s, "right", 100),
      (s) => debug.setBallHeld(s, false),
      (s) => debug.setBallVelocity(s, -300, 0),
    );
    await rig.frames(60);
    expect(Math.abs(snap(rig).paddles.right.cy - FIELD_CY)).toBeLessThanOrEqual(
      18,
    );
  });

  it("chases a ball that is coming at it", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.setBallHeld(s, false),
      (s) => debug.setBallPosition(s, 700, 600),
      (s) => debug.setBallVelocity(s, 10, 0),
    );
    await rig.frames(30);
    expect(snap(rig).paddles.right.cy).toBeGreaterThan(FIELD_CY + 100);
  });

  it("stays put with movement off and goes home with tracking off", async () => {
    const rig = await makeRig();
    const { debug } = rig;
    rig.pose(
      (s) => debug.setScreen(s, "playing"),
      (s) => debug.setBallHeld(s, false),
      (s) => debug.setPaddleCy(s, "right", 200),
      (s) => debug.setAiMovement(s, false),
    );
    await rig.frames(10);
    expect(snap(rig).paddles.right.cy).toBe(200);
    expect(snap(rig).paddles.right.vy).toBe(0);
    rig.pose(
      (s) => debug.setAiMovement(s, true),
      (s) => debug.setAiTracking(s, false),
      (s) => debug.setBallPosition(s, 700, 650),
      (s) => debug.setBallVelocity(s, 10, 0),
    );
    await rig.frames(30);
    expect(Math.abs(snap(rig).paddles.right.cy - FIELD_CY)).toBeLessThanOrEqual(
      18,
    );
  });
});

describe("frame-rate independence", () => {
  async function rally(stepMs: number) {
    const rig = await liveRig(stepMs);
    const { debug } = rig;
    rig.pose(
      (s) => debug.setMode(s, "versus"),
      (s) => debug.spawnObstacle(s, 0),
      (s) => debug.spawnObstacle(s, 1),
      (s) => debug.setPaddleCy(s, "left", 100),
      (s) => debug.setPaddleCy(s, "right", 620),
      (s) => debug.setBallPosition(s, 640, 360),
      (s) => debug.setBallVelocity(s, -420, 180),
      (s) => debug.setBallSpin(s, 300),
    );
    const frames = Math.round(1500 / stepMs);
    await rig.frames(frames);
    return snap(rig);
  }

  it("reaches the same speed and score at 2 ms and 16 ms", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(fine.score).toEqual(coarse.score);
    expect(
      Math.abs((fine.ball?.speed ?? 0) - (coarse.ball?.speed ?? 0)),
    ).toBeLessThan(10);
    expect(Math.sign(fine.ball?.vx ?? 0)).toBe(Math.sign(coarse.ball?.vx ?? 0));
  });
});
