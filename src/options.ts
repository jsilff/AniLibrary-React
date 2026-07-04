import type {
	AnimationOptions,
	AnimationPreset,
	Direction,
	NormalizedAnimationOptions,
	NormalizedAnimationPreset,
	ZoomMode,
} from './types.js';

export const DEFAULT_ANIMATION_OPTIONS: NormalizedAnimationOptions = {
	preset: 'fade',
	contentKind: 'mixed',
	trigger: 'scroll',
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

export function normalizeAnimationOptions(options: AnimationOptions = {}): NormalizedAnimationOptions {
	const normalizedPreset = normalizePresetSettings(options.preset, options.direction, options.zoomMode);
	const trigger = normalizedPreset.preset === 'scroll-media' ? 'scroll-media' : options.trigger || DEFAULT_ANIMATION_OPTIONS.trigger;

	return {
		...DEFAULT_ANIMATION_OPTIONS,
		...options,
		...normalizedPreset,
		trigger,
		loop: trigger === 'loop' || !!options.loop,
		bounceCount: Math.max(1, Math.min(8, Number(options.bounceCount || DEFAULT_ANIMATION_OPTIONS.bounceCount))),
		duration: Math.max(0, Number(options.duration ?? DEFAULT_ANIMATION_OPTIONS.duration)),
		delay: Math.max(0, Number(options.delay ?? DEFAULT_ANIMATION_OPTIONS.delay)),
		stagger: Math.max(0, Number(options.stagger ?? DEFAULT_ANIMATION_OPTIONS.stagger)),
		intensity: Math.max(10, Math.min(200, Number(options.intensity ?? DEFAULT_ANIMATION_OPTIONS.intensity))),
		threshold: Math.max(0, Math.min(1, Number(options.threshold ?? DEFAULT_ANIMATION_OPTIONS.threshold))),
		rootMargin: String(options.rootMargin ?? DEFAULT_ANIMATION_OPTIONS.rootMargin),
	};
}

export function getAnimationClassName(options: AnimationOptions = {}, className = ''): string {
	const normalized = normalizeAnimationOptions(options);
	return [
		'abw-wrapper',
		`abw-preset-${normalized.preset}`,
		`abw-trigger-${normalized.trigger}`,
		`abw-kind-${normalized.contentKind}`,
		className,
	].filter(Boolean).join(' ');
}

export function getAnimationDataAttributes(options: AnimationOptions = {}): Record<string, string> {
	const normalized = normalizeAnimationOptions(options);

	return {
		'data-ffaw-preset': normalized.preset,
		'data-ffaw-content-kind': normalized.contentKind,
		'data-ffaw-trigger': normalized.trigger,
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
}
