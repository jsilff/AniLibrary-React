# AniLibrary React

[![npm version](https://img.shields.io/npm/v/@jsilff/anilibrary-react.svg)](https://www.npmjs.com/package/@jsilff/anilibrary-react)
[![license](https://img.shields.io/npm/l/@jsilff/anilibrary-react.svg)](https://www.npmjs.com/package/@jsilff/anilibrary-react)

React-first refactor of the WordPress AniLibrary wrapper plugin.

- **npm:** [@jsilff/anilibrary-react](https://www.npmjs.com/package/@jsilff/anilibrary-react)
- **GitHub:** [jsilff/AniLibrary-React](https://github.com/jsilff/AniLibrary-React)
- **Releases:** [v0.1.0 and later](https://github.com/jsilff/AniLibrary-React/releases)

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
- `direction`: `up`, `down`, `left`, `right`, `clockwise`, `counterclockwise`, `vertical`, or `horizontal`
- `zoomMode`: `in` or `out`
- `duration`, `delay`, `stagger`, `intensity`, `easing`, `threshold`, `rootMargin`
- `once`, `loop`, `clickToggle`, `hideUntilHover`
- `textGranularity`: `word`, `character`, or `line`
- `inheritParentDelay`, `followParentAnimation`

The package also exports:

- `normalizeAnimationOptions`
- `getAnimationClassName`
- `getAnimationDataAttributes`
- `setupAnimationWrapper`
- `initAnimationWrappers`

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
