# React Animation Block Wrapper

React-first refactor of the WordPress AniLibrary wrapper block.

The current WordPress plugin remains in `../WordPress Animation Block Wrapper`. This repo is a separate React package so the animation system can be reused by React apps without coupling the public API to Gutenberg attributes or `InnerBlocks`.

## Recommended Shape

Use a component as the API:

```tsx
import { AnimationWrapper } from "@fearlessfuture/animation-block-wrapper-react";
import "@fearlessfuture/animation-block-wrapper-react/styles.css";

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
} from "@fearlessfuture/animation-block-wrapper-react";

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
