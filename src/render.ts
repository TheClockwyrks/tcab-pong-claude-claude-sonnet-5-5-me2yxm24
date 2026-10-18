// Everything Carom draws, in the field's logical units. Reads the state and
// touches nothing but the context it is handed.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
} from "./constants";
import type { BallState, CaromState, Mode, Side } from "./game";
import { menuItems, menuRect } from "./menu";

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

const COLORS = {
  field: "#080b17",
  fieldLight: "#101734",
  grid: "rgba(120, 150, 255, 0.05)",
  net: "rgba(190, 205, 255, 0.35)",
  left: "#38e1ff",
  right: "#ff4f9a",
  obstacle: "#ffc24a",
  ball: "#ffffff",
  text: "#e8ecff",
  dim: "rgba(232, 236, 255, 0.55)",
  scrim: "rgba(8, 11, 23, 0.74)",
} as const;

const SIDE_COLOR: Record<Side, string> = {
  left: COLORS.left,
  right: COLORS.right,
};

type Ctx = CanvasRenderingContext2D;
type State = DeepReadonly<CaromState>;

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function glowRect(
  ctx: Ctx,
  rect: { x: number; y: number; w: number; h: number },
  radius: number,
  color: string,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fill();
  ctx.restore();
  // A lighter band along the field-facing half gives the body some volume.
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  roundedRect(ctx, rect.x + 2, rect.y + 3, rect.w / 2 - 2, rect.h - 6, radius);
  ctx.fill();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = "bold",
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

// ---- The field -------------------------------------------------------------

function drawBackdrop(ctx: Ctx): void {
  const sky = ctx.createRadialGradient(
    FIELD_CX,
    FIELD_H / 2,
    40,
    FIELD_CX,
    FIELD_H / 2,
    FIELD_W * 0.62,
  );
  sky.addColorStop(0, COLORS.fieldLight);
  sky.addColorStop(1, COLORS.field);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 80; x < FIELD_W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 80; y < FIELD_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(190, 205, 255, 0.22)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FIELD_W - 4, FIELD_H - 4);
}

function drawNet(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = COLORS.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 12);
  ctx.lineTo(NET_X, FIELD_H - 12);
  ctx.stroke();
  ctx.restore();
}

function drawObstacles(ctx: Ctx, state: State): void {
  for (const o of state.obstacles) {
    glowRect(
      ctx,
      {
        x: o.cx - OBSTACLE_W / 2,
        y: o.cy - OBSTACLE_H / 2,
        w: OBSTACLE_W,
        h: OBSTACLE_H,
      },
      8,
      COLORS.obstacle,
    );
  }
}

function drawPaddles(ctx: Ctx, state: State): void {
  const { left, right } = state.paddles;
  glowRect(
    ctx,
    { x: P1_X0, y: left.cy - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H },
    8,
    COLORS.left,
  );
  glowRect(
    ctx,
    { x: P2_X0, y: right.cy - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H },
    8,
    COLORS.right,
  );
}

function drawTrail(ctx: Ctx, ball: DeepReadonly<BallState>): void {
  const { trail } = ball;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const age = i / trail.length;
    ctx.strokeStyle = `rgba(255, 244, 214, ${(0.55 * age).toFixed(3)})`;
    ctx.lineWidth = BALL_R * 2 * age;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: Ctx, ball: DeepReadonly<BallState>): void {
  drawTrail(ctx, ball);
  ctx.save();
  ctx.shadowColor = "#fff3c4";
  ctx.shadowBlur = 24;
  ctx.fillStyle = COLORS.ball;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function modeLabel(mode: Mode): string {
  return mode === "solo" ? "SOLO  ·  YOU vs AI" : "VERSUS  ·  2 PLAYERS";
}

function drawHud(ctx: Ctx, state: State): void {
  text(ctx, String(state.score.p1), FIELD_CX - 120, 70, 76, COLORS.left);
  text(ctx, String(state.score.p2), FIELD_CX + 120, 70, 76, COLORS.right);
  text(ctx, modeLabel(state.mode), FIELD_CX, FIELD_H - 26, 18, COLORS.dim);
}

function drawServeCue(ctx: Ctx, state: State, ball: DeepReadonly<BallState>) {
  const progress = 1 - Math.max(0, ball.holdTimer) / HOLD_TIME;
  ctx.save();
  ctx.strokeStyle = SIDE_COLOR[state.receiver];
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 14,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * progress,
  );
  ctx.stroke();
  ctx.restore();

  const dir = state.receiver === "left" ? -1 : 1;
  const tip = ball.x + dir * 96;
  ctx.fillStyle = SIDE_COLOR[state.receiver];
  ctx.beginPath();
  ctx.moveTo(tip, ball.y);
  ctx.lineTo(tip - dir * 18, ball.y - 12);
  ctx.lineTo(tip - dir * 18, ball.y + 12);
  ctx.closePath();
  ctx.fill();
  text(ctx, "GET READY", FIELD_CX, FIELD_CY_LABEL, 30, COLORS.text);
}

const FIELD_CY_LABEL = FIELD_H / 2 - 90;

/** The playfield furniture: backdrop, net, obstacles, paddles, and ball. */
function drawField(ctx: Ctx, state: State): void {
  drawBackdrop(ctx);
  drawNet(ctx);
  drawObstacles(ctx, state);
  drawPaddles(ctx, state);
  if (state.ball) drawBall(ctx, state.ball);
}

// ---- Menus and screens -----------------------------------------------------

function drawMenu(ctx: Ctx, state: State): void {
  const items = menuItems(state.screen);
  if (!items) return;
  items.forEach((label, index) => {
    const rect = menuRect(state.screen, index);
    if (!rect) return;
    const selected = index === state.menuIndex;
    ctx.save();
    if (selected) {
      ctx.shadowColor = COLORS.left;
      ctx.shadowBlur = 20;
      ctx.fillStyle = COLORS.left;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(190, 205, 255, 0.4)";
      ctx.lineWidth = 2;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.stroke();
    }
    ctx.restore();
    text(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      26,
      selected ? "#06101c" : COLORS.text,
    );
  });
}

function scrim(ctx: Ctx, alpha = 1): void {
  ctx.fillStyle = COLORS.scrim;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.globalAlpha = 1;
}

function drawTitle(ctx: Ctx, state: State): void {
  scrim(ctx, 0.6);
  ctx.save();
  ctx.shadowColor = COLORS.left;
  ctx.shadowBlur = 36;
  text(ctx, TITLE_TEXT, FIELD_CX, 190, 150, COLORS.text);
  ctx.restore();
  text(
    ctx,
    "A TOP-DOWN PADDLE DUEL  ·  CURVE IT OFF THE OBSTACLES",
    FIELD_CX,
    292,
    20,
    COLORS.dim,
  );
  drawMenu(ctx, state);
  text(
    ctx,
    "W / S  or  ↑ / ↓  to move    ENTER to select",
    FIELD_CX,
    660,
    18,
    COLORS.dim,
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  ["MOVE", "Player 1: W / S    Player 2: ↑ / ↓    (Solo: either pair)"],
  ["MENUS", "ENTER or SPACE confirms, ESC goes back or pauses, P pauses"],
  ["SOUND", "M mutes and unmutes"],
  ["SCORE", `First to 11, two clear. Pass the far edge behind a paddle.`],
  ["SPIN", "Strike the ball while your paddle is moving: it curves"],
  ["", "after the hit, in the direction you were travelling."],
  ["EDGES", "Where it meets the paddle sets the angle; each hit speeds it up."],
  ["BANKS", "The two obstacles are solid. Bounce, bend, and bank around them."],
];

function drawHowTo(ctx: Ctx, state: State): void {
  scrim(ctx, 0.94);
  text(ctx, "HOW TO PLAY", FIELD_CX, 100, 64, COLORS.text);
  HOWTO_LINES.forEach(([head, body], i) => {
    const y = 195 + i * 46;
    text(ctx, head, 250, y, 22, COLORS.obstacle, "left");
    text(ctx, body, 370, y, 22, COLORS.text, "left", "normal");
  });
  drawMenu(ctx, state);
}

function drawPaused(ctx: Ctx, state: State): void {
  scrim(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 84, COLORS.text);
  drawMenu(ctx, state);
}

function drawMatchOver(ctx: Ctx, state: State): void {
  scrim(ctx);
  const side =
    state.winner ?? (state.score.p1 > state.score.p2 ? "left" : "right");
  const who =
    side === "left"
      ? "PLAYER 1"
      : state.mode === "solo"
        ? "THE AI"
        : "PLAYER 2";
  ctx.save();
  ctx.shadowColor = SIDE_COLOR[side];
  ctx.shadowBlur = 30;
  text(ctx, `${who} WINS`, FIELD_CX, 210, 80, SIDE_COLOR[side]);
  ctx.restore();
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    320,
    64,
    COLORS.text,
  );
  drawMenu(ctx, state);
}

/** Draws the whole frame for `state`. */
export function drawGame(ctx: Ctx, state: State): void {
  drawField(ctx, state);
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowTo(ctx, state);
      break;
    case "countdown":
      drawHud(ctx, state);
      if (state.ball) drawServeCue(ctx, state, state.ball);
      break;
    case "playing":
      drawHud(ctx, state);
      break;
    case "paused":
      drawHud(ctx, state);
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawHud(ctx, state);
      drawMatchOver(ctx, state);
      break;
  }
}
