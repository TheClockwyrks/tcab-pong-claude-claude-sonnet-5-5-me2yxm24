// The menus: their items, hit regions, and the keyboard, pointer, and touch
// input that drives them (specs/ui.md).

import type { PointerSample } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuPress, Screen } from "./game";
import type { InputFrame } from "./input";
import { returnToTitle, startMatch } from "./world";

/** The how-to screen's single item. */
export const HOWTO_ITEMS = ["BACK"] as const;

export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ITEM_W = 360;
const ITEM_H = 54;
const ITEM_STEP = 68;

/** The top of the first item of each menu screen. */
const MENU_TOP: Partial<Record<Screen, number>> = {
  title: 400,
  howto: 610,
  paused: 330,
  matchover: 430,
};

/** The items of the menu `screen` shows, or `null` where it shows none. */
export function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    default:
      return null;
  }
}

/** The hit region of item `index` on `screen`'s menu, or `null`. */
export function menuRect(screen: Screen, index: number): MenuRect | null {
  const items = menuItems(screen);
  const top = MENU_TOP[screen];
  if (!items || top === undefined) return null;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    return null;
  }
  return {
    x: FIELD_CX - ITEM_W / 2,
    y: top + index * ITEM_STEP,
    w: ITEM_W,
    h: ITEM_H,
  };
}

function itemAt(screen: Screen, x: number, y: number): number | null {
  const count = menuItems(screen)?.length ?? 0;
  for (let index = 0; index < count; index++) {
    const r = menuRect(screen, index);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return index;
    }
  }
  return null;
}

/** What a frame's pointer and touch samples did to a menu. */
interface PointerOutcome {
  readonly selected: number | null;
  readonly confirmed: number | null;
  readonly presses: readonly MenuPress[];
}

function readPointer(
  screen: Screen,
  samples: readonly PointerSample[],
  start: readonly MenuPress[],
): PointerOutcome {
  let selected: number | null = null;
  let confirmed: number | null = null;
  let presses = start;
  for (const sample of samples) {
    if (sample.button !== null && sample.button !== "primary") continue;
    const hit = itemAt(screen, sample.x, sample.y);
    if (sample.type === "up") {
      const landed = presses.find((p) => p.id === sample.id);
      presses = presses.filter((p) => p.id !== sample.id);
      if (landed && landed.index === hit) {
        selected = hit;
        confirmed = hit;
      }
      continue;
    }
    if (hit !== null) selected = hit;
    if (sample.type === "down") {
      presses = presses.filter((p) => p.id !== sample.id);
      if (hit !== null) presses = [...presses, { id: sample.id, index: hit }];
    }
  }
  return { selected, confirmed, presses };
}

/** Applies confirming item `index` of the menu `state.screen` shows. */
function confirm(state: DeepReadonly<CaromState>, index: number): CaromState {
  switch (state.screen) {
    case "title":
      return confirmTitle({ ...state, titleIndex: index }, index);
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return { ...state, screen: state.resumeScreen };
      return index === 1 ? startMatch(state, state.mode) : returnToTitle(state);
    case "matchover":
      return index === 0 ? startMatch(state, state.mode) : returnToTitle(state);
    default:
      return state;
  }
}

function confirmTitle(
  state: DeepReadonly<CaromState>,
  index: number,
): CaromState {
  if (index === 0) return startMatch(state, "solo");
  if (index === 1) return startMatch(state, "versus");
  return { ...state, screen: "howto", menuIndex: 0 };
}

function wrap(index: number, delta: number, count: number): number {
  return (index + delta + count) % count;
}

/** Drives the menu `state.screen` shows from this frame's input. */
function driveMenu(
  state: DeepReadonly<CaromState>,
  input: InputFrame,
  items: readonly string[],
): CaromState {
  const moves = items.length > 1;
  let index = state.menuIndex;
  const moved = moves && (input.upEdge || input.downEdge);
  if (moves && input.upEdge) index = wrap(index, -1, items.length);
  else if (moves && input.downEdge) index = wrap(index, 1, items.length);

  const pointer = readPointer(state.screen, input.samples, state.menuPresses);
  const next = { ...state, menuPresses: pointer.presses };

  if (input.confirm)
    return moved ? { ...next, menuIndex: index } : confirm(next, index);
  if (pointer.selected !== null) index = pointer.selected;
  const selected = { ...next, menuIndex: index };
  if (pointer.confirmed !== null) return confirm(selected, pointer.confirmed);
  if (input.back && !moved && state.screen !== "title") {
    return returnToTitle(selected);
  }
  return selected;
}

/**
 * Reads this frame's input on the screen the update began on and returns the
 * state it leaves: menu moves, confirms, pauses, and resumes.
 */
export function runMenus(
  state: DeepReadonly<CaromState>,
  input: InputFrame,
): CaromState {
  const { screen } = state;
  if (screen === "countdown" || screen === "playing") {
    return input.pause
      ? { ...state, resumeScreen: screen, screen: "paused", menuIndex: 0 }
      : state;
  }
  if (screen === "paused" && (input.pause || input.back)) {
    return { ...state, screen: state.resumeScreen };
  }
  const items = menuItems(screen);
  if (!items) return state;
  const result = driveMenu(state, input, items);
  return result.screen === screen ? result : { ...result, menuPresses: [] };
}
