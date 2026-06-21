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
- `trigger`: `scroll`, `load`, `hover`, `click`, or `loop`
- `contentKind`: `text`, `media`, `layout`, or `mixed`
- `direction`: `up`, `down`, `left`, `right`, `clockwise`, `counterclockwise`, `vertical`, or `horizontal`
- `zoomMode`: `in` or `out`
- `duration`, `delay`, `stagger`, `intensity`, `easing`, `threshold`
- `once`, `loop`, `clickToggle`, `hideUntilHover`
- `textGranularity`: `word`, `character`, or `line`
- `inheritParentDelay`, `followParentAnimation`

The package also exports:

- `normalizeAnimationOptions`
- `getAnimationClassName`
- `getAnimationDataAttributes`
- `setupAnimationWrapper`
- `initAnimationWrappers`

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

## Publishing

Published releases are tagged on GitHub and published to npm. Each GitHub release corresponds to an npm version.

**Current release:** [v0.1.0](https://github.com/jsilff/AniLibrary-React/releases/tag/v0.1.0) → [@jsilff/anilibrary-react@0.1.0](https://www.npmjs.com/package/@jsilff/anilibrary-react/v/0.1.0)

To publish a new version:

```bash
npm version patch   # or minor / major
git push origin main --tags
npm publish
```

Pushing a `v*` tag also creates a [GitHub Release](https://github.com/jsilff/AniLibrary-React/releases) via CI.
