# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off two obstacles in the middle. You score when the
ball passes the far edge behind your opponent's paddle; first to 11, leading by
two, wins.

The twist is **spin**: the motion of your paddle at the moment it strikes the
ball curves the ball's flight afterwards, so the obstacles turn the field into a
bank-shot puzzle. Play **Solo** against the AI or **Versus** with a friend on one
keyboard.

Everything is drawn in code on a canvas, and no art or audio files are shipped.
It is built on the Simple 2D engine (documented in `engine/`) in TypeScript.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Open the address Vite prints. The 1280x720 field is fitted to the window at any
size.

## Production build

```sh
npm run build
```

This type-checks and writes the static site to `dist/`, with `index.html` at its
root. Serve that directory as-is from any static host, or try it locally with
`npm run preview`.

## Controls

| Action              | Keys                              |
| ------------------- | --------------------------------- |
| Player 1 up / down  | `W` / `S`                         |
| Player 2 up / down  | `Up` / `Down` arrows              |
| Confirm             | `Enter` or `Space`                |
| Back                | `Esc`                             |
| Pause / resume      | `P` or `Esc`                      |
| Mute / unmute       | `M`                               |
| Debug overlay       | `` ` `` (backtick)                |

In Solo, either pair of movement keys moves your (left) paddle. Menus also take
the mouse and touch: hover or tap an item, then click or lift to confirm. On a
touchscreen, on-screen sliders move the paddles.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --check
npm test            # vitest, with coverage
```

## Layout

- `src/game.ts` — the state types and the `game` the engine runs.
- `src/sim.ts` — paddles, the AI, ball physics, serving, and scoring.
- `src/menu.ts` — menu items, hit regions, and keyboard/pointer/touch input.
- `src/debug.ts` — the debug and automation surface (`specs/instrumentation.md`).
- `src/render.ts` — all drawing.
- `src/world.ts`, `src/input.ts` — state builders and the per-frame input read.
- `showcase/` — the store-page description, carousel, and media.
- `specs/` — the specification this build follows.
