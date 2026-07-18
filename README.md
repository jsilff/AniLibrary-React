# AniLibrary React

[![npm version](https://img.shields.io/npm/v/@jsilff/anilibrary-react.svg)](https://www.npmjs.com/package/@jsilff/anilibrary-react)
[![license](https://img.shields.io/npm/l/@jsilff/anilibrary-react.svg)](https://www.npmjs.com/package/@jsilff/anilibrary-react)

React-first refactor of the WordPress AniLibrary wrapper plugin.

- **npm:** [@jsilff/anilibrary-react](https://www.npmjs.com/package/@jsilff/anilibrary-react)
- **GitHub:** [jsilff/AniLibrary-React](https://github.com/jsilff/AniLibrary-React)
- **Releases:** [v0.1.0 and later](https://github.com/jsilff/AniLibrary-React/releases)

## Changelog

### v0.2.0

Behavioral parity with the WordPress AniLibrary 1.2.0 runtime, plus the exit-animation system.

- **New: `animationMode`** (`in` | `out` | `both`, default `in`). `in` plays the entrance only, `out` starts at rest and exits on leave/toggle, and `both` does a full enter/exit cycle. Exit keyframes are **derived from the entrance preset** — there is no separate exit catalog.
- **New: `exitMode`** (`rewind` | `continue`, default `rewind`) — used when the wrapper plays out. `rewind` reverses the entrance path (back the way it came); `continue` keeps the opacity/blur cue but flips directional transforms so motion carries through. Multi-step soft loops always rewind.
- **Exit triggers:** exit now plays on hover leave, click toggle-off, and scroll leave whenever the mode includes `out`.
- **Legacy inference:** if `animationMode` is unset, `hover` (and `click` + `clickToggle`, and `scroll` + `once={false}`) infer `both` so they exit as before. Set `animationMode="in"` explicitly to opt out of the exit. **Hover exit therefore needs `animationMode` to include `out` (which is the default inference for hover).**
- **Exit gating:** exits are skipped while the entrance is still delayed, queued until a mid-flight entrance finishes (no interrupted cycles), and the initial invisible state is re-primed after a skip/exit.
- **Hide-until-hover:** selective CSS keeps the wrapper's own content and *joining* child wrappers hidden until hover arms it, while independent nested wrappers stay visible and run their own animations. Hover start-hidden state is primed on load when `hideUntilHover` is on.
- **Reverse stagger on text exits:** the last split unit leaves first.
- **Nested targeting:** clearer "join parent animation" (`followParentAnimation`) vs "match parent timing" (`inheritParentDelay`); nested-only parents (e.g. Rise wrapping a Hover child) fall back to animating the child shell so the outer effect fires.
- **Parent replay cascade:** replaying a parent (loop / repeat) cascades to direct nested `scroll` children in view and nested `loop` children.
- Preserves all React-specific features: `optionsAt`, `rootMargin`, `trigger="inherit"`, `abw-pending` no-flash priming, and marked `abw-stagger-item` layout targets.
- Added a jsdom + `node:test` suite (`npm test`) covering nesting targets, exit gating, hide-until-hover visibility, delay inheritance, mode resolution, and parent-replay cascading.

### v0.1.7

- **Fix:** scroll animations no longer flicker when an element sits on the viewport edge. `AnimationWrapper` always forwarded unset props as `undefined` (e.g. `once`), and `normalizeAnimationOptions` spread those over the defaults — so `once: true` became falsy and leaving the root re-primed the hidden state. Undefined option keys are now stripped before merge, and `once` falls back to the default explicitly.

### v0.1.6

- `optionsAt` responsive overrides, no-flash priming (`abw-pending` + layout-effect keyframe priming).

### v0.1.5

- Native layout stagger for lists/grids; mobile scroll stability improvements.

## Installation

```bash
npm install @jsilff/anilibrary-react
```

Requires React 18.2+ as a peer dependency (`react` and `react-dom`).

## Quick start

```tsx
import { AnimationWrapper } from "@jsilff/anilibrary-react";
import "@jsilff/anilibrary-react/styles.css";

export function Example() {
  return (
    <AnimationWrapper preset="fade" trigger="scroll" direction="up">
      <h2>Animated content</h2>
      <p>The wrapper controls when and how this content animates.</p>
    </AnimationWrapper>
  );
}
```

Classes are still useful, but they should be an implementation detail. The wrapper component gives React apps a declarative API, handles refs, effect cleanup, reduced-motion checks, scroll observers, and nested wrapper timing.

## API

`AnimationWrapper` accepts these animation props:

- `preset`: `fade`, `slide`, `zoom`, `blur-in`, `rotate-in`, `flip`, `text-rise`, `word-cascade`, `letter-pop`, `pulse-soft`, `float-soft`, or `bounce-soft`
- `trigger`: `scroll`, `load`, `hover`, `click`, `loop`, or `inherit`
- `contentKind`: `text`, `media`, `layout`, or `mixed`
- `animationMode`: `in` (entrance only, default), `out` (exit only), or `both` (enter + exit)
- `exitMode`: `rewind` (reverse the entrance, default) or `continue` (flip travel direction on exit) — only used when the mode plays out
- `direction`: `up`, `down`, `left`, `right`, `clockwise`, `counterclockwise`, `vertical`, or `horizontal`
- `zoomMode`: `in` or `out`
- `duration`, `delay`, `stagger`, `intensity`, `easing`, `threshold`, `rootMargin`
- `once` (default `true`), `loop`, `clickToggle`, `hideUntilHover`
- `textGranularity`: `word`, `character`, or `line`
- `inheritParentDelay`, `followParentAnimation`
- `optionsAt`: responsive overrides keyed by CSS media query (see below)

### Enter / exit modes

By default a wrapper only plays its entrance (`animationMode="in"`). To also animate an exit, set `animationMode="both"` (enter then exit) or `animationMode="out"` (start visible, exit on the trigger). The exit is derived from the entrance preset — pick how it leaves with `exitMode`:

```tsx
<AnimationWrapper preset="fade" trigger="hover" animationMode="both" exitMode="continue">
  <p>Fades up on hover, keeps drifting up as it leaves.</p>
</AnimationWrapper>
```

> **Hover note:** when `animationMode` is unset, `hover` (and `click` + `clickToggle`, and replayable `scroll` with `once={false}`) infer `both` so they exit on leave — matching the WordPress runtime. Pass `animationMode="in"` to disable the exit.

The package also exports:

- `normalizeAnimationOptions`
- `applyOptionsAt`
- `shouldPrimeOnMount`
- `animationStartsHidden`
- `getAnimationClassName`
- `getAnimationDataAttributes`
- `setupAnimationWrapper`
- `initAnimationWrappers`
- `deriveExitKeyframes`
- `resolveAnimationMode`
- `normalizeExitMode`
- `animationModeIncludesIn` / `animationModeIncludesOut`

## Responsive options (`optionsAt`)

Use `optionsAt` to override animation props at specific breakpoints. Entries are evaluated **in order**; the **first matching** `query` wins. Any prop except `optionsAt` itself can be overridden (`direction`, `stagger`, `rootMargin`, etc.).

```tsx
<AnimationWrapper
  preset="slide"
  trigger="scroll"
  direction="right"
  once
  optionsAt={[
    { query: "(max-width: 767px)", direction: "up" },
  ]}
>
  <h2>Slides in from the right on desktop, up on mobile</h2>
</AnimationWrapper>
```

On breakpoint change, the runtime re-resolves options and re-primes hidden state **before play**. Animations that already ran with `once` are not restarted.

> **Note:** `prefers-reduced-motion: reduce` is handled globally by the library — animations are disabled automatically and content is shown immediately. You do not need (and should not add) a reduced-motion entry in `optionsAt`; doing so implies it is opt-in when it is already built in.

## Initial hidden state (no flash on load)

Scroll- and load-triggered presets that start hidden (fade, slide, zoom, etc.) use a two-step priming system so content does not flash visible before the animation runtime attaches:

1. **`abw-pending` (CSS)** — applied at render time so the wrapper is hidden on first paint and during SSR hydration.
2. **`primeInitialState()` (runtime)** — runs synchronously in `useLayoutEffect` before browser paint, applying the exact keyframe-from values (`opacity`, `transform`, `filter`) to animation targets.

Once the animation runs or completes, pending/hidden styles are cleared. Presets that start fully visible (e.g. `pulse-soft`, `float-soft`) skip priming.

Import `@jsilff/anilibrary-react/styles.css` in your app — the `.abw-pending` rule lives there.

## Staggered lists (one observer)

For lists, grids, or timelines, prefer **one parent wrapper** with `contentKind="layout"` and `stagger` instead of wrapping each item in its own scroll-triggered `AnimationWrapper`. That uses a single `IntersectionObserver` and avoids mobile jitter from many observers re-firing.

```tsx
<AnimationWrapper
  preset="slide"
  trigger="scroll"
  direction="up"
  contentKind="layout"
  stagger={80}
  once
  rootMargin="0px 0px -5% 0px"
  className="grid gap-6"
>
  {items.map((item) => (
    <article key={item.id}>{item.title}</article>
  ))}
</AnimationWrapper>
```

Direct children are stagger targets by default. Mark specific children with `className="abw-stagger-item"` or `data-ffaw-stagger-item="1"` when you need finer control.

For lazy-mounted sections (e.g. below-the-fold content loaded after hydration), use `trigger="load"` on the parent instead of `scroll`.

Nested child wrappers that should animate with the parent stagger (not their own observer) should use `trigger="inherit"` with `followParentAnimation`:

```tsx
<AnimationWrapper preset="fade" trigger="scroll" contentKind="layout" stagger={80} once>
  {items.map((item) => (
    <AnimationWrapper
      key={item.id}
      as="article"
      preset="fade"
      trigger="inherit"
      followParentAnimation
    >
      {item.title}
    </AnimationWrapper>
  ))}
</AnimationWrapper>
```

## Text presets

When using `contentKind="text"` with presets like `letter-pop` or `word-cascade`, put the heading or paragraph **inside** the wrapper (recommended), or set `as="h1"` / `as="p"` so the wrapper is the text element itself — both patterns are supported as of v0.1.1.

```tsx
// Recommended
<AnimationWrapper preset="letter-pop" trigger="load" contentKind="text" textGranularity="character">
  <h1>Animated title</h1>
</AnimationWrapper>

// Also supported (v0.1.1+)
<AnimationWrapper as="h1" preset="letter-pop" trigger="load" contentKind="text" textGranularity="character">
  Animated title
</AnimationWrapper>
```

## WordPress Bridge

The React API deliberately preserves the old runtime contract:

```tsx
import {
  getAnimationClassName,
  getAnimationDataAttributes,
} from "@jsilff/anilibrary-react";

const props = {
  className: getAnimationClassName({ preset: "fade" }),
  ...getAnimationDataAttributes({ preset: "fade" }),
};
```

That makes it possible to migrate the WordPress editor later without forcing a rewrite of saved markup.

## Development

```bash
git clone https://github.com/jsilff/AniLibrary-React.git
cd AniLibrary-React
npm install   # runs prepare → build automatically
npm run typecheck
npm run build
```

The compiled output lives in `dist/` (gitignored). `prepare` runs on `npm install`, `npm pack`, and publish so `dist/` is always built before the package is consumed.

### Using locally in another project

```bash
# From this repo
npm run build
npm link

# From your app
npm link @jsilff/anilibrary-react
```

Or add a file dependency:

```json
{
  "dependencies": {
    "@jsilff/anilibrary-react": "file:../path/to/anilibrary-react"
  }
}
```

`npm install` in the app will trigger `prepare` and build `dist/` automatically.
