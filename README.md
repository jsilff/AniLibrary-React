# AniLibrary React

React-first refactor of the WordPress AniLibrary wrapper plugin.

## Recommended Shape

Use a component as the API:

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
npm install
npm run typecheck
npm run build
```
