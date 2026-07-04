import React, { useEffect, useMemo, useRef } from 'react';
import { getAnimationClassName, getAnimationDataAttributes, normalizeAnimationOptions } from './options.js';
import { setupAnimationWrapper } from './runtime.js';
import type { AnimationOptions, AnimationRuntimeHandle } from './types.js';

export interface AnimationWrapperProps
	extends AnimationOptions,
		Omit<React.HTMLAttributes<HTMLElement>, keyof AnimationOptions> {
	as?: keyof React.JSX.IntrinsicElements;
	disabled?: boolean;
}

export function AnimationWrapper({
	as = 'div',
	children,
	className,
	disabled = false,
	preset,
	contentKind,
	trigger,
	intensity,
	direction,
	zoomMode,
	bounceCount,
	duration,
	delay,
	stagger,
	easing,
	once,
	threshold,
	rootMargin,
	loop,
	clickToggle,
	hideUntilHover,
	inheritParentDelay,
	followParentAnimation,
	textGranularity,
	...domProps
}: AnimationWrapperProps) {
	const elementRef = useRef<HTMLElement | null>(null);
	const runtimeRef = useRef<AnimationRuntimeHandle | null>(null);

	const options = useMemo(
		() => normalizeAnimationOptions({
			preset,
			contentKind,
			trigger,
			intensity,
			direction,
			zoomMode,
			bounceCount,
			duration,
			delay,
			stagger,
			easing,
			once,
			threshold,
			rootMargin,
			loop,
			clickToggle,
			hideUntilHover,
			inheritParentDelay,
			followParentAnimation,
			textGranularity,
		}),
		[
			preset,
			contentKind,
			trigger,
			intensity,
			direction,
			zoomMode,
			bounceCount,
			duration,
			delay,
			stagger,
			easing,
			once,
			threshold,
			rootMargin,
			loop,
			clickToggle,
			hideUntilHover,
			inheritParentDelay,
			followParentAnimation,
			textGranularity,
		]
	);

	useEffect(() => {
		if (!elementRef.current || disabled) {
			runtimeRef.current?.destroy();
			runtimeRef.current = null;
			return;
		}

		runtimeRef.current = setupAnimationWrapper(elementRef.current, options);
		return () => {
			runtimeRef.current?.destroy();
			runtimeRef.current = null;
		};
	}, [disabled, options]);

	return React.createElement(
		as,
		{
			...domProps,
			...getAnimationDataAttributes(options),
			ref: elementRef,
			className: getAnimationClassName(options, className),
		},
		children
	);
}
