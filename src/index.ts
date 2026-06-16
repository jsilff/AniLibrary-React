export { AnimationWrapper, type AnimationWrapperProps } from './AnimationWrapper.js';
export {
	DEFAULT_ANIMATION_OPTIONS,
	PRESETS,
	getAnimationClassName,
	getAnimationDataAttributes,
	normalizeAnimationOptions,
	normalizePresetSettings,
} from './options.js';
export { setupAnimationWrapper, initAnimationWrappers } from './runtime.js';
export type {
	AnimationOptions,
	AnimationPreset,
	AnimationRuntimeHandle,
	AnimationTrigger,
	ContentKind,
	Direction,
	Easing,
	NormalizedAnimationOptions,
	NormalizedAnimationPreset,
	TextGranularity,
	ZoomMode,
} from './types.js';
