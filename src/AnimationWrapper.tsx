import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { applyOptionsAt } from './responsive.js';
import { getAnimationClassName, getAnimationDataAttributes } from './options.js';
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
	animationMode,
	exitMode,
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
	optionsAt,
	...domProps
}: AnimationWrapperProps) {
	const elementRef = useRef<HTMLElement | null>(null);
	const runtimeRef = useRef<AnimationRuntimeHandle | null>(null);

	const rawOptions = useMemo(
		() => ({
			preset,
			contentKind,
			trigger,
			animationMode,
			exitMode,
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
			optionsAt,
		}),
		[
			preset,
			contentKind,
			trigger,
			animationMode,
			exitMode,
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
			optionsAt,
		]
	);

	const renderOptions = useMemo(
		() => applyOptionsAt(rawOptions, rawOptions.optionsAt ?? []),
		[rawOptions]
	);

	useLayoutEffect(() => {
		if (!elementRef.current || disabled) {
			runtimeRef.current?.destroy();
			runtimeRef.current = null;
			return;
		}

		runtimeRef.current = setupAnimationWrapper(elementRef.current, rawOptions);
		return () => {
			runtimeRef.current?.destroy();
			runtimeRef.current = null;
		};
	}, [disabled, rawOptions]);

	return React.createElement(
		as,
		{
			...domProps,
			...getAnimationDataAttributes(rawOptions),
			ref: elementRef,
			className: getAnimationClassName(renderOptions, className),
		},
		children
	);
}
