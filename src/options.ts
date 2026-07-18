import type {
	AnimationMode,
	AnimationOptions,
	AnimationPreset,
	Direction,
	ExitMode,
	NormalizedAnimationOptions,
	NormalizedAnimationPreset,
	ZoomMode,
} from './types.js';
import { applyIntensityToKeyframes } from './intensity.js';
import { resolvePresetKeyframes, type AnimationFrame } from './keyframes.js';
import { applyOptionsAt } from './responsive.js';

export const DEFAULT_ANIMATION_OPTIONS: NormalizedAnimationOptions = {
	preset: 'fade',
	contentKind: 'mixed',
	trigger: 'scroll',
	animationMode: 'in',
	exitMode: 'rewind',
	intensity: 100,
	direction: 'up',
	zoomMode: 'in',
	bounceCount: 1,
	duration: 700,
	delay: 0,
	stagger: 0,
	easing: 'ease-out',
	once: true,
	threshold: 0.25,
	rootMargin: '',
	loop: false,
	clickToggle: false,
	hideUntilHover: false,
	inheritParentDelay: false,
	followParentAnimation: false,
	textGranularity: 'word',
};

export const PRESETS: NormalizedAnimationPreset[] = [
	'fade',
	'slide',
	'zoom',
	'blur-in',
	'scroll-media',
	'rotate-in',
	'flip',
	'text-rise',
	'word-cascade',
	'letter-pop',
	'pulse-soft',
	'float-soft',
	'bounce-soft',
];

export function normalizePresetSettings(
	rawPreset?: AnimationPreset,
	rawDirection?: Direction,
	rawZoomMode?: ZoomMode
): Pick<NormalizedAnimationOptions, 'preset' | 'direction' | 'zoomMode'> {
	let preset: NormalizedAnimationPreset = rawPreset && PRESETS.includes(rawPreset as NormalizedAnimationPreset)
		? rawPreset as NormalizedAnimationPreset
		: 'fade';
	let direction: Direction = rawDirection || 'up';
	let zoomMode: ZoomMode = rawZoomMode || 'in';

	if (rawPreset === 'fade-up') {
		preset = 'fade';
		direction = 'up';
	} else if (rawPreset === 'fade-down') {
		preset = 'fade';
		direction = 'down';
	} else if (rawPreset === 'fade-left') {
		preset = 'fade';
		direction = 'left';
	} else if (rawPreset === 'fade-right') {
		preset = 'fade';
		direction = 'right';
	} else if (rawPreset === 'slide-up') {
		preset = 'slide';
		direction = 'up';
	} else if (rawPreset === 'slide-down') {
		preset = 'slide';
		direction = 'down';
	} else if (rawPreset === 'slide-left') {
		preset = 'slide';
		direction = 'left';
	} else if (rawPreset === 'slide-right') {
		preset = 'slide';
		direction = 'right';
	} else if (rawPreset === 'zoom-in') {
		preset = 'zoom';
		zoomMode = 'in';
	} else if (rawPreset === 'zoom-out') {
		preset = 'zoom';
		zoomMode = 'out';
	} else if (rawPreset === 'flip-y') {
		preset = 'flip';
		if (!rawDirection || rawDirection === 'up' || rawDirection === 'down') {
			direction = 'vertical';
		}
	}

	return { preset, direction, zoomMode };
}

export function normalizeExitMode(rawMode?: string): ExitMode {
	return rawMode === 'continue' ? 'continue' : 'rewind';
}

export function animationModeIncludesIn(mode: AnimationMode): boolean {
	return mode === 'in' || mode === 'both';
}

export function animationModeIncludesOut(mode: AnimationMode): boolean {
	return mode === 'out' || mode === 'both';
}

/**
 * Infer the animation mode from the remaining wiring when it isn't set explicitly.
 * Mirrors the WordPress legacy inference so migrated markup keeps its exit wiring:
 * hover, click+toggle, and replayable scroll all imply an exit too.
 */
function inferAnimationMode(
	trigger: AnimationOptions['trigger'],
	clickToggle: boolean | undefined,
	once: boolean | undefined
): AnimationMode {
	if (trigger === 'hover') {
		return 'both';
	}
	if (trigger === 'click' && clickToggle) {
		return 'both';
	}
	if (trigger === 'scroll' && once === false) {
		return 'both';
	}
	return 'in';
}

/**
 * Resolve the animation mode from a wrapper's data attributes.
 * Explicit `in`/`out`/`both` win; otherwise fall back to legacy inference.
 * Used by the data-attribute (WordPress-style) init path.
 */
export function resolveAnimationMode(wrapper: HTMLElement): AnimationMode {
	const raw = wrapper.dataset.ffawAnimationMode;
	if (raw === 'out' || raw === 'both' || raw === 'in') {
		return raw;
	}
	const trigger = (wrapper.dataset.ffawTrigger || 'scroll') as AnimationOptions['trigger'];
	const clickToggle = wrapper.dataset.ffawClickToggle === '1';
	const once = wrapper.dataset.ffawOnce !== '0';
	return inferAnimationMode(trigger, clickToggle, once);
}

/**
 * A preset "starts hidden" when its first frame fades in from below full opacity.
 * Matches the WordPress runtime: soft loops (pulse/float/bounce) begin at rest
 * (opacity 1 / undefined) and must not be primed hidden or flagged for no-flash.
 */
export function keyframesStartHidden(keyframes: AnimationFrame[]): boolean {
	const from = keyframes[0];
	if (!from) {
		return false;
	}
	const firstOpacity = from.opacity;
	if (firstOpacity === undefined) {
		return false;
	}
	const numericOpacity = Number(firstOpacity);
	return !Number.isNaN(numericOpacity) && numericOpacity < 1;
}

export function animationStartsHidden(options: AnimationOptions = {}): boolean {
	const merged = applyOptionsAt(options, options.optionsAt ?? []);
	const normalized = normalizeAnimationOptions(merged);
	const keyframes = applyIntensityToKeyframes(
		resolvePresetKeyframes(normalized.preset, normalized.direction, normalized.zoomMode, normalized.textGranularity),
		normalized.intensity
	);
	return keyframesStartHidden(keyframes);
}

export function shouldPrimeOnMount(options: AnimationOptions = {}): boolean {
	const merged = applyOptionsAt(options, options.optionsAt ?? []);
	const normalized = normalizeAnimationOptions(merged);

	// Out-only wrappers start at rest (visible) and only exit later — never prime hidden.
	if (normalized.animationMode === 'out') {
		return false;
	}

	if (normalized.trigger === 'scroll-media' || normalized.trigger === 'inherit') {
		return normalized.followParentAnimation && animationStartsHidden(merged);
	}

	if (normalized.trigger === 'hover' && !normalized.hideUntilHover) {
		return false;
	}

	if (['scroll', 'load', 'click', 'loop'].includes(normalized.trigger)) {
		return animationStartsHidden(merged);
	}

	if (normalized.trigger === 'hover' && normalized.hideUntilHover) {
		return animationStartsHidden(merged);
	}

	return false;
}

export function normalizeAnimationOptions(options: AnimationOptions = {}): NormalizedAnimationOptions {
	const normalizedPreset = normalizePresetSettings(options.preset, options.direction, options.zoomMode);
	const trigger = normalizedPreset.preset === 'scroll-media' ? 'scroll-media' : options.trigger || DEFAULT_ANIMATION_OPTIONS.trigger;

	// Drop undefined keys so React props like `once={undefined}` don't clobber defaults.
	// Otherwise scroll wrappers re-prime on every viewport-edge leave and flicker.
	const definedOptions = Object.fromEntries(
		Object.entries(options).filter(([, value]) => value !== undefined)
	) as AnimationOptions;

	const explicitMode = definedOptions.animationMode;
	const animationMode: AnimationMode = explicitMode === 'in' || explicitMode === 'out' || explicitMode === 'both'
		? explicitMode
		: inferAnimationMode(trigger, definedOptions.clickToggle, definedOptions.once);

	return {
		...DEFAULT_ANIMATION_OPTIONS,
		...definedOptions,
		...normalizedPreset,
		trigger,
		animationMode,
		exitMode: normalizeExitMode(definedOptions.exitMode),
		loop: trigger === 'loop' || !!definedOptions.loop,
		bounceCount: Math.max(1, Math.min(8, Number(definedOptions.bounceCount || DEFAULT_ANIMATION_OPTIONS.bounceCount))),
		duration: Math.max(0, Number(definedOptions.duration ?? DEFAULT_ANIMATION_OPTIONS.duration)),
		delay: Math.max(0, Number(definedOptions.delay ?? DEFAULT_ANIMATION_OPTIONS.delay)),
		stagger: Math.max(0, Number(definedOptions.stagger ?? DEFAULT_ANIMATION_OPTIONS.stagger)),
		intensity: Math.max(10, Math.min(200, Number(definedOptions.intensity ?? DEFAULT_ANIMATION_OPTIONS.intensity))),
		threshold: Math.max(0, Math.min(1, Number(definedOptions.threshold ?? DEFAULT_ANIMATION_OPTIONS.threshold))),
		rootMargin: String(definedOptions.rootMargin ?? DEFAULT_ANIMATION_OPTIONS.rootMargin),
		once: definedOptions.once ?? DEFAULT_ANIMATION_OPTIONS.once,
	};
}

export function getAnimationClassName(options: AnimationOptions = {}, className = ''): string {
	const normalized = normalizeAnimationOptions(options);
	return [
		'abw-wrapper',
		`abw-preset-${normalized.preset}`,
		`abw-trigger-${normalized.trigger}`,
		`abw-kind-${normalized.contentKind}`,
		shouldPrimeOnMount(options) ? 'abw-pending' : '',
		className,
	].filter(Boolean).join(' ');
}

export function getAnimationDataAttributes(options: AnimationOptions = {}): Record<string, string> {
	const normalized = normalizeAnimationOptions(options);
	const attributes: Record<string, string> = {
		'data-ffaw-preset': normalized.preset,
		'data-ffaw-content-kind': normalized.contentKind,
		'data-ffaw-trigger': normalized.trigger,
		'data-ffaw-animation-mode': normalized.animationMode,
		'data-ffaw-exit-mode': normalized.exitMode,
		'data-ffaw-intensity': String(normalized.intensity),
		'data-ffaw-direction': normalized.direction,
		'data-ffaw-zoom-mode': normalized.zoomMode,
		'data-ffaw-bounce-count': String(normalized.bounceCount),
		'data-ffaw-duration': String(normalized.duration),
		'data-ffaw-delay': String(normalized.delay),
		'data-ffaw-stagger': String(normalized.stagger),
		'data-ffaw-easing': normalized.easing,
		'data-ffaw-once': normalized.once ? '1' : '0',
		'data-ffaw-threshold': String(normalized.threshold),
		'data-ffaw-root-margin': normalized.rootMargin,
		'data-ffaw-loop': normalized.loop ? '1' : '0',
		'data-ffaw-click-toggle': normalized.clickToggle ? '1' : '0',
		'data-ffaw-hide-until-hover': normalized.hideUntilHover ? '1' : '0',
		'data-ffaw-inherit-parent-delay': normalized.inheritParentDelay ? '1' : '0',
		'data-ffaw-follow-parent-animation': normalized.followParentAnimation ? '1' : '0',
		'data-ffaw-text-granularity': normalized.textGranularity,
	};

	if (options.optionsAt?.length) {
		attributes['data-ffaw-options-at'] = JSON.stringify(options.optionsAt);
	}

	return attributes;
}
