import { applyIntensityToKeyframes, clamp } from './intensity.js';
import { resolvePresetKeyframes, type AnimationFrame } from './keyframes.js';
import { getAnimationDataAttributes, normalizeAnimationOptions } from './options.js';
import type { AnimationOptions, AnimationRuntimeHandle, NormalizedAnimationOptions } from './types.js';

const TEXT_SPLIT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption';

interface WrapperElement extends HTMLElement {
	abwAnimations?: Animation[];
}

function canAnimate(): boolean {
	return typeof window !== 'undefined' && typeof Element !== 'undefined' && 'animate' in Element.prototype;
}

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyDataAttributes(wrapper: HTMLElement, options: NormalizedAnimationOptions): void {
	Object.entries(getAnimationDataAttributes(options)).forEach(([key, value]) => {
		wrapper.setAttribute(key, value);
	});
}

function applyInitialState(target: HTMLElement, keyframes: AnimationFrame[]): void {
	const from = keyframes[0];
	if (!from) {
		return;
	}
	Object.entries(from).forEach(([property, value]) => {
		if (property === 'offset' || value === undefined || value === null) {
			return;
		}
		target.style.setProperty(property, String(value));
	});
}

function clearInlineState(target: HTMLElement): void {
	target.style.opacity = '';
	target.style.transform = '';
	target.style.filter = '';
}

function keyframesStartHidden(keyframes: AnimationFrame[]): boolean {
	const firstOpacity = keyframes[0]?.opacity;
	if (firstOpacity === undefined) {
		return false;
	}
	const numericOpacity = Number(firstOpacity);
	return !Number.isNaN(numericOpacity) && numericOpacity < 1;
}

function collectSplitTextNodes(element: HTMLElement, owningWrapper: HTMLElement): Text[] {
	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode(node) {
				if (!node.nodeValue || !node.nodeValue.trim()) {
					return NodeFilter.FILTER_REJECT;
				}
				const parent = node.parentElement;
				if (!parent || parent.closest('.abw-text-unit') || parent.closest('script,style,noscript')) {
					return NodeFilter.FILTER_REJECT;
				}
				const closestWrapper = parent.closest('.abw-wrapper');
				if (closestWrapper && closestWrapper !== owningWrapper) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		}
	);

	let current = walker.nextNode();
	while (current) {
		textNodes.push(current as Text);
		current = walker.nextNode();
	}

	return textNodes;
}

function ensureSplitRoot(element: HTMLElement, mode: string): void {
	if (!element.dataset.abwOriginalHtml) {
		element.dataset.abwOriginalHtml = element.innerHTML;
	}

	if (element.dataset.abwSplitMode !== mode) {
		element.innerHTML = element.dataset.abwOriginalHtml;
	}

	if (mode !== 'character') {
		element.classList.remove('abw-text-character-mode');
	}
}

function splitElementTextUnits(element: HTMLElement, mode: string, owningWrapper: HTMLElement): void {
	ensureSplitRoot(element, mode);

	if (element.dataset.abwSplitMode === mode && element.querySelector('.abw-text-unit')) {
		return;
	}

	collectSplitTextNodes(element, owningWrapper).forEach((textNode) => {
		const fragment = document.createDocumentFragment();
		const tokens = (textNode.nodeValue || '').split(/(\s+)/);

		tokens.forEach((token) => {
			if (!token) {
				return;
			}
			if (/^\s+$/.test(token)) {
				fragment.appendChild(document.createTextNode(token));
				return;
			}
			const span = document.createElement('span');
			span.className = 'abw-text-unit';
			span.textContent = token;
			fragment.appendChild(span);
		});

		textNode.parentNode?.replaceChild(fragment, textNode);
	});

	element.dataset.abwSplitMode = mode;
}

function splitElementTextCharacters(element: HTMLElement, owningWrapper: HTMLElement): void {
	ensureSplitRoot(element, 'character');
	element.classList.add('abw-text-character-mode');

	if (element.dataset.abwSplitMode === 'character' && element.querySelector('.abw-text-unit-char')) {
		return;
	}

	collectSplitTextNodes(element, owningWrapper).forEach((textNode) => {
		const fragment = document.createDocumentFragment();
		const parts = (textNode.nodeValue || '').split(/(\s+)/);

		parts.forEach((part) => {
			if (!part) {
				return;
			}
			if (/^\s+$/.test(part)) {
				fragment.appendChild(document.createTextNode(part));
				return;
			}
			const word = document.createElement('span');
			word.className = 'abw-text-word';
			Array.from(part).forEach((char) => {
				const span = document.createElement('span');
				span.className = 'abw-text-unit abw-text-unit-char';
				span.textContent = char;
				word.appendChild(span);
			});
			fragment.appendChild(word);
		});

		textNode.parentNode?.replaceChild(fragment, textNode);
	});

	element.dataset.abwSplitMode = 'character';
}

function splitElementTextLines(element: HTMLElement, owningWrapper: HTMLElement): void {
	ensureSplitRoot(element, 'line');

	if (element.dataset.abwSplitMode === 'line' && element.querySelector('.abw-text-unit-line')) {
		return;
	}

	splitElementTextUnits(element, 'word', owningWrapper);

	const units = Array.from(element.querySelectorAll<HTMLElement>('.abw-text-unit'));
	if (!units.length) {
		element.dataset.abwSplitMode = 'line';
		return;
	}

	let lineIndex = -1;
	let lastTop: number | null = null;
	const lineMap = new Map<number, number>();

	units.forEach((unit, index) => {
		const top = Math.round(unit.getBoundingClientRect().top);
		if (lastTop === null || Math.abs(top - lastTop) > 2) {
			lineIndex += 1;
			lastTop = top;
		}
		lineMap.set(index, lineIndex);
	});

	const lineWords: string[][] = [];
	units.forEach((unit, index) => {
		const measuredLine = lineMap.get(index) ?? 0;
		if (!lineWords[measuredLine]) {
			lineWords[measuredLine] = [];
		}
		lineWords[measuredLine].push(unit.textContent || '');
	});

	const fragment = document.createDocumentFragment();
	lineWords.forEach((words) => {
		const lineText = words.join(' ').trim();
		if (!lineText) {
			return;
		}
		const line = document.createElement('span');
		line.className = 'abw-text-unit abw-text-unit-line';
		line.textContent = lineText;
		fragment.appendChild(line);
	});

	element.innerHTML = '';
	element.appendChild(fragment);
	element.dataset.abwSplitMode = 'line';
}

function restoreTextSplits(wrapper: HTMLElement): void {
	if (wrapper.dataset.abwOriginalHtml) {
		wrapper.innerHTML = wrapper.dataset.abwOriginalHtml;
		delete wrapper.dataset.abwSplitMode;
		wrapper.classList.remove('abw-text-character-mode');
		delete wrapper.dataset.abwOriginalHtml;
	}

	wrapper.querySelectorAll<HTMLElement>('[data-abw-original-html]').forEach((element) => {
		element.innerHTML = element.dataset.abwOriginalHtml || element.innerHTML;
		delete element.dataset.abwSplitMode;
		element.classList.remove('abw-text-character-mode');
	});
}

function resolveTextStagger(stagger: number, textGranularity: string): number {
	if (stagger > 0) {
		return stagger;
	}
	if (textGranularity === 'character') {
		return 22;
	}
	if (textGranularity === 'line') {
		return 120;
	}
	return 55;
}

function getTextSplitCandidates(wrapper: HTMLElement): HTMLElement[] {
	const descendants = Array.from(wrapper.querySelectorAll<HTMLElement>(TEXT_SPLIT_SELECTOR)).filter((element) => {
		return element.closest('.abw-wrapper') === wrapper;
	});

	if (wrapper.matches(TEXT_SPLIT_SELECTOR)) {
		return [wrapper, ...descendants];
	}

	return descendants;
}

function getAnimationTargets(wrapper: HTMLElement, options: NormalizedAnimationOptions): HTMLElement[] {
	const shouldTreatAsText = options.contentKind === 'text';
	const mode = options.textGranularity;

	if (shouldTreatAsText) {
		const candidates = getTextSplitCandidates(wrapper);

		candidates.forEach((element) => {
			if (mode === 'line') {
				splitElementTextLines(element, wrapper);
			} else if (mode === 'character') {
				splitElementTextCharacters(element, wrapper);
			} else {
				splitElementTextUnits(element, mode, wrapper);
			}
		});

		const selector = mode === 'line' ? '.abw-text-unit-line' : '.abw-text-unit';
		const textUnits = Array.from(wrapper.querySelectorAll<HTMLElement>(selector)).filter((unit) => {
			return unit.closest('.abw-wrapper') === wrapper;
		});

		if (textUnits.length) {
			return textUnits;
		}
	}

	restoreTextSplits(wrapper);
	return Array.from(wrapper.children).filter((child): child is HTMLElement => {
		if (!(child instanceof HTMLElement)) {
			return false;
		}
		if (child.classList.contains('abw-wrapper')) {
			return child.dataset.ffawFollowParentAnimation === '1';
		}
		return !child.querySelector('.abw-wrapper');
	});
}

function cancelWrapperAnimations(wrapper: WrapperElement): void {
	const animations = Array.isArray(wrapper.abwAnimations) ? wrapper.abwAnimations : [];
	animations.forEach((animation) => {
		try {
			animation.cancel();
		} catch {
			// Ignore already-finished animations.
		}
	});
	wrapper.abwAnimations = [];
}

function resolveInheritedDelay(wrapper: HTMLElement, ownDelay: number, visited = new Set<HTMLElement>()): number {
	const baseDelay = Math.max(0, ownDelay);
	if (wrapper.dataset.ffawInheritParentDelay !== '1') {
		return baseDelay;
	}
	if (visited.has(wrapper)) {
		return baseDelay;
	}
	visited.add(wrapper);

	const parentWrapper = wrapper.parentElement?.closest<HTMLElement>('.abw-wrapper');
	if (!parentWrapper) {
		return baseDelay;
	}

	const parentOwnDelay = Number(parentWrapper.dataset.ffawDelay || 0);
	return baseDelay + resolveInheritedDelay(parentWrapper, parentOwnDelay, visited);
}

function animateTargets(
	targets: HTMLElement[],
	keyframes: AnimationFrame[],
	options: NormalizedAnimationOptions,
	reverse = false
): Animation[] {
	const frames = reverse ? [...keyframes].reverse() : keyframes;
	const stagger = options.contentKind === 'text'
		? resolveTextStagger(options.stagger, options.textGranularity)
		: 0;
	const delay = resolveInheritedDelay(targets[0]?.closest<HTMLElement>('.abw-wrapper') || targets[0], options.delay);
	const iterations = options.loop && !reverse
		? Infinity
		: options.preset === 'bounce-soft'
			? options.bounceCount
			: 1;
	const fill = options.loop
		? delay > 0 ? 'backwards' : 'none'
		: delay > 0 ? 'both' : 'forwards';

	return targets.map((target, index) => {
		if (!reverse) {
			clearInlineState(target);
		}
		return target.animate(frames, {
			duration: options.duration,
			delay: delay + index * stagger,
			easing: options.easing,
			iterations,
			fill,
		});
	});
}

function resolveKeyframes(options: NormalizedAnimationOptions): AnimationFrame[] {
	return applyIntensityToKeyframes(
		resolvePresetKeyframes(options.preset, options.direction, options.zoomMode, options.textGranularity),
		options.intensity
	);
}

function isWrapperInViewport(wrapper: HTMLElement, threshold: number): boolean {
	const rect = wrapper.getBoundingClientRect();
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
	const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
	const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
	const area = rect.width * rect.height;

	if (viewportWidth <= 0 || viewportHeight <= 0 || visibleWidth <= 0 || visibleHeight <= 0 || area <= 0) {
		return false;
	}

	return (visibleWidth * visibleHeight) / area >= clamp(threshold, 0, 1);
}

export function setupAnimationWrapper(element: HTMLElement, rawOptions: AnimationOptions = {}): AnimationRuntimeHandle {
	const wrapper = element as WrapperElement;
	let options = normalizeAnimationOptions(rawOptions);
	let cleanupCallbacks: Array<() => void> = [];
	let hasPlayed = false;
	let toggled = false;

	const cleanup = () => {
		cleanupCallbacks.forEach((callback) => callback());
		cleanupCallbacks = [];
		cancelWrapperAnimations(wrapper);
		restoreTextSplits(wrapper);
	};

	const run = (reverse = false) => {
		if (!canAnimate() || prefersReducedMotion()) {
			return;
		}
		const keyframes = resolveKeyframes(options);
		const targets = getAnimationTargets(wrapper, options);
		if (!targets.length) {
			return;
		}
		cancelWrapperAnimations(wrapper);
		wrapper.abwAnimations = animateTargets(targets, keyframes, options, reverse);
		hasPlayed = true;
	};

	const primeInitialState = () => {
		if (!canAnimate() || prefersReducedMotion()) {
			return;
		}
		const keyframes = resolveKeyframes(options);
		if (!keyframesStartHidden(keyframes)) {
			return;
		}
		const targets = getAnimationTargets(wrapper, options);
		targets.forEach((target) => applyInitialState(target, keyframes));
	};

	const attach = () => {
		cleanup();
		applyDataAttributes(wrapper, options);
		Array.from(wrapper.classList).forEach((className) => {
			if (className.startsWith('abw-preset-') || className.startsWith('abw-trigger-') || className.startsWith('abw-kind-')) {
				wrapper.classList.remove(className);
			}
		});
		wrapper.classList.add('abw-wrapper', `abw-preset-${options.preset}`, `abw-trigger-${options.trigger}`, `abw-kind-${options.contentKind}`);

		if (!canAnimate() || prefersReducedMotion()) {
			wrapper.classList.add('abw-reduced-motion');
			return;
		}

		if (options.trigger === 'scroll-media') {
			return;
		}

		if (['scroll', 'load', 'click', 'loop'].includes(options.trigger) || (options.trigger === 'hover' && options.hideUntilHover)) {
			primeInitialState();
		}

		if (options.trigger === 'load' || options.trigger === 'loop') {
			const id = window.requestAnimationFrame(() => run(false));
			cleanupCallbacks.push(() => window.cancelAnimationFrame(id));
			return;
		}

		if (options.trigger === 'hover') {
			const onEnter = () => run(false);
			const onLeave = () => {
				if (options.hideUntilHover) {
					run(true);
				}
			};
			wrapper.addEventListener('mouseenter', onEnter);
			wrapper.addEventListener('mouseleave', onLeave);
			cleanupCallbacks.push(() => {
				wrapper.removeEventListener('mouseenter', onEnter);
				wrapper.removeEventListener('mouseleave', onLeave);
			});
			return;
		}

		if (options.trigger === 'click') {
			const onClick = () => {
				if (options.clickToggle && toggled) {
					run(true);
					toggled = false;
					return;
				}
				run(false);
				toggled = true;
			};
			wrapper.addEventListener('click', onClick);
			cleanupCallbacks.push(() => wrapper.removeEventListener('click', onClick));
			return;
		}

		if (typeof window.IntersectionObserver === 'function') {
			const observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting && entry.intersectionRatio >= options.threshold) {
							if (!options.once || !hasPlayed) {
								run(false);
							}
							if (options.once) {
								observer.unobserve(wrapper);
							}
						} else if (!options.once) {
							primeInitialState();
						}
					});
				},
				{ threshold: [0, options.threshold, 1] }
			);
			observer.observe(wrapper);
			cleanupCallbacks.push(() => observer.disconnect());
		} else {
			const onScroll = () => {
				if (isWrapperInViewport(wrapper, options.threshold) && (!options.once || !hasPlayed)) {
					run(false);
				}
			};
			window.addEventListener('scroll', onScroll, { passive: true });
			window.addEventListener('resize', onScroll, { passive: true });
			onScroll();
			cleanupCallbacks.push(() => {
				window.removeEventListener('scroll', onScroll);
				window.removeEventListener('resize', onScroll);
			});
		}
	};

	attach();

	return {
		update(nextOptions: AnimationOptions) {
			options = normalizeAnimationOptions(nextOptions);
			hasPlayed = false;
			toggled = false;
			attach();
		},
		destroy() {
			cleanup();
		},
	};
}

export function initAnimationWrappers(root: ParentNode = document): AnimationRuntimeHandle[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.abw-wrapper')).map((wrapper) => {
		return setupAnimationWrapper(wrapper, {
			preset: wrapper.dataset.ffawPreset as AnimationOptions['preset'],
			contentKind: wrapper.dataset.ffawContentKind as AnimationOptions['contentKind'],
			trigger: wrapper.dataset.ffawTrigger as AnimationOptions['trigger'],
			intensity: Number(wrapper.dataset.ffawIntensity || 100),
			direction: wrapper.dataset.ffawDirection as AnimationOptions['direction'],
			zoomMode: wrapper.dataset.ffawZoomMode as AnimationOptions['zoomMode'],
			bounceCount: Number(wrapper.dataset.ffawBounceCount || 1),
			duration: Number(wrapper.dataset.ffawDuration || 700),
			delay: Number(wrapper.dataset.ffawDelay || 0),
			stagger: Number(wrapper.dataset.ffawStagger || 0),
			easing: wrapper.dataset.ffawEasing,
			once: wrapper.dataset.ffawOnce !== '0',
			threshold: Number(wrapper.dataset.ffawThreshold || 0.25),
			loop: wrapper.dataset.ffawLoop === '1',
			clickToggle: wrapper.dataset.ffawClickToggle === '1',
			hideUntilHover: wrapper.dataset.ffawHideUntilHover === '1',
			inheritParentDelay: wrapper.dataset.ffawInheritParentDelay === '1',
			followParentAnimation: wrapper.dataset.ffawFollowParentAnimation === '1',
			textGranularity: wrapper.dataset.ffawTextGranularity as AnimationOptions['textGranularity'],
		});
	});
}
