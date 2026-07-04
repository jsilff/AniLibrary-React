export type AnimationPreset =
	| 'fade'
	| 'slide'
	| 'zoom'
	| 'blur-in'
	| 'scroll-media'
	| 'rotate-in'
	| 'flip'
	| 'text-rise'
	| 'word-cascade'
	| 'letter-pop'
	| 'pulse-soft'
	| 'float-soft'
	| 'bounce-soft'
	| 'fade-up'
	| 'fade-down'
	| 'fade-left'
	| 'fade-right'
	| 'slide-up'
	| 'slide-down'
	| 'slide-left'
	| 'slide-right'
	| 'zoom-in'
	| 'zoom-out'
	| 'flip-y';

export type NormalizedAnimationPreset =
	| 'fade'
	| 'slide'
	| 'zoom'
	| 'blur-in'
	| 'scroll-media'
	| 'rotate-in'
	| 'flip'
	| 'text-rise'
	| 'word-cascade'
	| 'letter-pop'
	| 'pulse-soft'
	| 'float-soft'
	| 'bounce-soft';

export type AnimationTrigger = 'scroll' | 'load' | 'hover' | 'click' | 'loop' | 'scroll-media' | 'inherit';
export type ContentKind = 'text' | 'media' | 'layout' | 'mixed';
export type Direction =
	| 'up'
	| 'down'
	| 'left'
	| 'right'
	| 'clockwise'
	| 'counterclockwise'
	| 'vertical'
	| 'horizontal'
	| 'scroll'
	| 'scroll-reverse';
export type ZoomMode = 'in' | 'out';
export type TextGranularity = 'word' | 'character' | 'line';
export type Easing = 'ease-out' | 'ease-in-out' | 'linear' | 'cubic-bezier(0.65,0,0.35,1)' | string;

export type ResponsiveAnimationOverride = {
	query: string;
} & Partial<Omit<AnimationOptions, 'optionsAt'>>;

export interface AnimationOptions {
	preset?: AnimationPreset;
	contentKind?: ContentKind;
	trigger?: AnimationTrigger;
	intensity?: number;
	direction?: Direction;
	zoomMode?: ZoomMode;
	bounceCount?: number;
	duration?: number;
	delay?: number;
	stagger?: number;
	easing?: Easing;
	once?: boolean;
	threshold?: number;
	rootMargin?: string;
	loop?: boolean;
	clickToggle?: boolean;
	hideUntilHover?: boolean;
	inheritParentDelay?: boolean;
	followParentAnimation?: boolean;
	textGranularity?: TextGranularity;
	optionsAt?: ResponsiveAnimationOverride[];
}

export interface NormalizedAnimationOptions extends Required<Omit<AnimationOptions, 'optionsAt'>> {
	preset: NormalizedAnimationPreset;
	trigger: AnimationTrigger;
}

export interface AnimationRuntimeHandle {
	update(options: AnimationOptions): void;
	destroy(): void;
}
