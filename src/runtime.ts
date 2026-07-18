import { applyIntensityToKeyframes, clamp, parseNumericToken } from './intensity.js';
import { resolvePresetKeyframes, type AnimationFrame } from './keyframes.js';
import {
	animationModeIncludesIn,
	animationModeIncludesOut,
	getAnimationDataAttributes,
	keyframesStartHidden,
	normalizeAnimationOptions,
	normalizeExitMode,
	normalizePresetSettings,
	resolveAnimationMode,
	shouldPrimeOnMount,
} from './options.js';
import { applyOptionsAt, parseOptionsAtAttribute, subscribeOptionsAt } from './responsive.js';
import type {
	AnimationMode,
	AnimationOptions,
	AnimationPreset,
	AnimationRuntimeHandle,
	ContentKind,
	Direction,
	ExitMode,
	NormalizedAnimationOptions,
	TextGranularity,
	ZoomMode,
} from './types.js';

const TEXT_SPLIT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption';

interface PlayConfig {
	directionOverride?: Direction;
	exitMode?: ExitMode;
	startDelay?: number;
	forceSingleIteration?: boolean;
	fromParentReplay?: boolean;
	onComplete?: () => void;
	onSkipped?: () => void;
	shouldProceed?: () => boolean;
}

interface WrapperElement extends HTMLElement {
	abwAnimations?: Animation[];
	abwEntranceCompleted?: boolean;
	abwExitQueued?: boolean;
	abwExitQueueToken?: number;
	abwReplay?: (config?: PlayConfig) => void;
}

type TargetOptions = Pick<NormalizedAnimationOptions, 'contentKind' | 'textGranularity'>;

function canAnimate(): boolean {
	return typeof window !== 'undefined' && typeof Element !== 'undefined' && 'animate' in Element.prototype;
}

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------- */
/* Scroll-linked direction tracking                                           */
/* -------------------------------------------------------------------------- */

let abwLastScrollY = 0;
let abwScrollDirection: 'up' | 'down' = 'down';
let abwScrollTrackerAttached = false;

function attachScrollDirectionTracker(): void {
	if (abwScrollTrackerAttached || typeof window === 'undefined') {
		return;
	}
	abwLastScrollY = window.scrollY || window.pageYOffset || 0;
	window.addEventListener('scroll', () => {
		const nextY = window.scrollY || window.pageYOffset || 0;
		abwScrollDirection = nextY >= abwLastScrollY ? 'down' : 'up';
		abwLastScrollY = nextY;
	}, { passive: true });
	abwScrollTrackerAttached = true;
}

function resolveScrollLinkedDirection(direction: Direction): Direction {
	if (direction === 'scroll') {
		return abwScrollDirection === 'up' ? 'up' : 'down';
	}
	if (direction === 'scroll-reverse') {
		return abwScrollDirection === 'up' ? 'down' : 'up';
	}
	return direction;
}

/* -------------------------------------------------------------------------- */
/* Priming / inline state                                                     */
/* -------------------------------------------------------------------------- */

function syncPendingClass(wrapper: HTMLElement, options: AnimationOptions): void {
	if (shouldPrimeOnMount(options)) {
		wrapper.classList.add('abw-pending');
	} else {
		wrapper.classList.remove('abw-pending');
	}
}

function clearPendingClass(wrapper: HTMLElement): void {
	wrapper.classList.remove('abw-pending');
}

function applyDataAttributes(wrapper: HTMLElement, rawOptions: AnimationOptions): void {
	Object.entries(getAnimationDataAttributes(rawOptions)).forEach(([key, value]) => {
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

/* -------------------------------------------------------------------------- */
/* Text splitting                                                             */
/* -------------------------------------------------------------------------- */

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

function scheduleTextRestore(
	wrapper: HTMLElement,
	duration: number,
	delay: number,
	stagger: number,
	targetCount: number,
	shouldLoop: boolean
): void {
	if (shouldLoop || wrapper.dataset.ffawContentKind !== 'text') {
		return;
	}

	const existingTimer = Number(wrapper.dataset.abwRestoreTimer || 0);
	if (existingTimer) {
		window.clearTimeout(existingTimer);
	}

	const totalDelay = delay + Math.max(0, targetCount - 1) * stagger + duration + 40;
	const timer = window.setTimeout(() => {
		restoreTextSplits(wrapper);
		wrapper.dataset.abwRestoreTimer = '';
	}, totalDelay);

	wrapper.dataset.abwRestoreTimer = String(timer);
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

/* -------------------------------------------------------------------------- */
/* Exit keyframe derivation                                                   */
/* -------------------------------------------------------------------------- */

function negateLinearToken(token: string): string {
	const parsed = parseNumericToken(token);
	if (!parsed) {
		return token;
	}
	return `${-parsed.value}${parsed.unit}`;
}

function mirrorScaleToken(token: string): string {
	const parsed = parseNumericToken(token);
	if (!parsed) {
		return token;
	}
	// Mirror the delta around identity: scale(0.92) ↔ scale(1.08).
	return `${2 - parsed.value}${parsed.unit}`;
}

function invertDirectionalTransform(transform: string): string {
	if (!transform) {
		return transform;
	}

	return String(transform)
		.replace(/translate3d\(([^,]+),([^,]+),([^)]+)\)/g, (_m, x, y, z) =>
			`translate3d(${negateLinearToken(x)}, ${negateLinearToken(y)}, ${negateLinearToken(z)})`
		)
		.replace(/translateX\(([^)]+)\)/g, (_m, x) => `translateX(${negateLinearToken(x)})`)
		.replace(/translateY\(([^)]+)\)/g, (_m, y) => `translateY(${negateLinearToken(y)})`)
		.replace(/translateZ\(([^)]+)\)/g, (_m, z) => `translateZ(${negateLinearToken(z)})`)
		.replace(/scale\(([^)]+)\)/g, (_m, s) => `scale(${mirrorScaleToken(s)})`)
		.replace(/rotate(?:X|Y|Z)?\(([^)]+)\)/g, (m, v) => {
			const fn = m.slice(0, m.indexOf('('));
			return `${fn}(${negateLinearToken(v)})`;
		});
}

function stripKeyframeOffsets(keyframes: AnimationFrame[]): AnimationFrame[] {
	return keyframes.map((frame) => {
		const next = { ...frame };
		delete next.offset;
		return next;
	});
}

function deriveContinueExitEnd(entryOffFrame: AnimationFrame): AnimationFrame {
	const exitEnd = { ...entryOffFrame };
	delete exitEnd.offset;
	if (typeof exitEnd.transform === 'string') {
		exitEnd.transform = invertDirectionalTransform(exitEnd.transform);
	}
	return exitEnd;
}

/**
 * Build exit keyframes from an entrance sequence without a separate preset catalog.
 * - rewind: play the entry path backwards (back the way it came)
 * - continue: keep opacity/filter exit cues, but flip directional transforms so motion continues
 */
export function deriveExitKeyframes(entryKeyframes: AnimationFrame[], exitMode: ExitMode = 'rewind'): AnimationFrame[] {
	if (!Array.isArray(entryKeyframes) || entryKeyframes.length < 2) {
		return entryKeyframes || [];
	}

	const mode = exitMode === 'continue' ? 'continue' : 'rewind';
	const hasTimedOffsets = entryKeyframes.some((frame) => frame && typeof frame.offset === 'number');

	// Multi-step loops (pulse/float/bounce) only support rewind cleanly.
	if (mode === 'rewind' || hasTimedOffsets) {
		return stripKeyframeOffsets([...entryKeyframes].reverse());
	}

	const restFrame = { ...entryKeyframes[entryKeyframes.length - 1] };
	delete restFrame.offset;
	const exitEnd = deriveContinueExitEnd(entryKeyframes[0]);
	return [restFrame, exitEnd];
}

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

function getParentFollowWrapperTargets(wrapper: HTMLElement): HTMLElement[] {
	return Array.from(wrapper.children).filter((child): child is HTMLElement => {
		if (!(child instanceof HTMLElement)) {
			return false;
		}
		if (!child.classList.contains('abw-wrapper')) {
			return false;
		}
		return child.dataset.ffawFollowParentAnimation === '1';
	});
}

function getDirectChildTargets(wrapper: HTMLElement): HTMLElement[] {
	return Array.from(wrapper.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function getMarkedStaggerTargets(wrapper: HTMLElement): HTMLElement[] {
	return getDirectChildTargets(wrapper).filter((child) => {
		return child.classList.contains('abw-stagger-item') || child.dataset.ffawStaggerItem === '1';
	});
}

function mergeFollowTargets(wrapper: HTMLElement, targets: HTMLElement[]): HTMLElement[] {
	const merged = Array.isArray(targets) ? [...targets] : [];
	getParentFollowWrapperTargets(wrapper).forEach((target) => {
		if (!merged.includes(target)) {
			merged.push(target);
		}
	});
	return merged;
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

function getAnimationTargets(wrapper: HTMLElement, options: TargetOptions): HTMLElement[] {
	const shouldTreatAsText = options.contentKind === 'text';
	const mode = (['word', 'character', 'line'] as const).includes(options.textGranularity)
		? options.textGranularity
		: 'word';

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
			return mergeFollowTargets(wrapper, textUnits);
		}
	}

	restoreTextSplits(wrapper);

	// React-specific: explicitly marked stagger items win when present.
	const marked = getMarkedStaggerTargets(wrapper);
	if (marked.length) {
		return marked;
	}

	const childTargets = getDirectChildTargets(wrapper);
	const preferredTargets = childTargets.filter((child) => {
		if (child.classList.contains('abw-wrapper')) {
			// Only wrappers that opt into joining the parent motion.
			return child.dataset.ffawFollowParentAnimation === '1';
		}
		// Skip mixed blocks that contain their own nested AniLibrary wrappers.
		if (child.querySelector('.abw-wrapper')) {
			return false;
		}
		return true;
	});

	// Nested-only parents (e.g. Rise wrapping a Hover child) previously got zero
	// targets and never fired. Fall back to animating direct children as shells.
	if (preferredTargets.length) {
		return preferredTargets;
	}
	return childTargets;
}

/* -------------------------------------------------------------------------- */
/* Animation core                                                             */
/* -------------------------------------------------------------------------- */

interface AnimateOptions {
	duration: number;
	delay: number;
	stagger: number;
	easing: string;
	iterations: number;
	fill: FillMode;
	exitMode: ExitMode;
}

function animateTargets(
	targets: HTMLElement[],
	keyframes: AnimationFrame[],
	options: AnimateOptions,
	reverse: boolean
): Animation[] {
	const isReverse = !!reverse;
	const frames = isReverse ? deriveExitKeyframes(keyframes, options.exitMode) : keyframes;
	const animations: Animation[] = [];
	const lastIndex = Math.max(0, targets.length - 1);

	targets.forEach((target, index) => {
		if (!isReverse) {
			clearInlineState(target);
		}
		const staggerIndex = isReverse ? lastIndex - index : index;
		const animation = target.animate(frames, {
			duration: options.duration,
			delay: options.delay + staggerIndex * options.stagger,
			easing: options.easing,
			iterations: options.iterations,
			fill: options.fill,
		});
		animations.push(animation);
	});

	return animations;
}

function cancelWrapperAnimations(wrapper: WrapperElement): void {
	const runningAnimations = Array.isArray(wrapper.abwAnimations) ? wrapper.abwAnimations : [];
	runningAnimations.forEach((animation) => {
		try {
			animation.cancel();
		} catch {
			// Ignore cancel failures from already-finished animations.
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

function resolveWrapperAnimationState(wrapper: HTMLElement, directionOverride?: Direction): {
	preset: NormalizedAnimationOptions['preset'];
	textGranularity: TextGranularity;
	contentKind: ContentKind;
	keyframes: AnimationFrame[];
} {
	const rawPreset = (wrapper.dataset.ffawPreset as AnimationPreset) || 'fade';
	const selectedDirection = (directionOverride || wrapper.dataset.ffawDirection || 'up') as Direction;
	const zoomMode = (wrapper.dataset.ffawZoomMode as ZoomMode) || 'in';
	const normalized = normalizePresetSettings(rawPreset, selectedDirection, zoomMode);
	const textGranularity = (wrapper.dataset.ffawTextGranularity as TextGranularity) || 'word';
	const contentKind = (wrapper.dataset.ffawContentKind as ContentKind) || 'mixed';
	const intensity = Number(wrapper.dataset.ffawIntensity || 100);
	const keyframes = applyIntensityToKeyframes(
		resolvePresetKeyframes(normalized.preset, normalized.direction, normalized.zoomMode, textGranularity),
		intensity
	);

	return { preset: normalized.preset, textGranularity, contentKind, keyframes };
}

function animateChildren(wrapper: WrapperElement, reverse = false, config: PlayConfig = {}): void {
	const animationState = resolveWrapperAnimationState(wrapper, config.directionOverride);
	const { preset, textGranularity, contentKind, keyframes } = animationState;
	const shouldLoop = wrapper.dataset.ffawLoop === '1' || wrapper.dataset.ffawTrigger === 'loop';

	let targets = getAnimationTargets(wrapper, { contentKind, textGranularity });
	targets = mergeFollowTargets(wrapper, targets);

	const rawStagger = Number(wrapper.dataset.ffawStagger || 0);
	const bounceCount = Math.max(1, Math.min(8, Number(wrapper.dataset.ffawBounceCount || 1)));
	const isTextContent = contentKind === 'text';
	const forceSingleIteration = !!config.forceSingleIteration;
	const exitMode = normalizeExitMode(config.exitMode || wrapper.dataset.ffawExitMode || 'rewind');

	// Text uses granularity-derived cascades; layout/media keeps the configured stagger.
	let effectiveStagger = isTextContent ? resolveTextStagger(rawStagger, textGranularity) : rawStagger;
	if (shouldLoop && isTextContent && textGranularity === 'character' && targets.length > 1) {
		// Keep character loops snappy by capping total stagger window.
		const maxCascadeMs = 900;
		const cappedStep = Math.max(4, Math.floor(maxCascadeMs / (targets.length - 1)));
		effectiveStagger = Math.min(effectiveStagger, cappedStep);
	}

	const duration = Number(wrapper.dataset.ffawDuration || 700);
	const configuredDelay = Number(wrapper.dataset.ffawDelay || 0);
	const hasCustomStartDelay = Number.isFinite(config.startDelay);
	const delay = hasCustomStartDelay
		? Math.max(0, Number(config.startDelay))
		: reverse
			? 0
			: resolveInheritedDelay(wrapper, configuredDelay);
	const iterations = shouldLoop && !forceSingleIteration
		? Infinity
		: preset === 'bounce-soft'
			? bounceCount
			: 1;
	const fillMode: FillMode = shouldLoop
		? delay > 0 ? 'backwards' : 'none'
		: delay > 0 ? 'both' : 'forwards';

	cancelWrapperAnimations(wrapper);
	if (reverse) {
		const existingTimer = Number(wrapper.dataset.abwRestoreTimer || 0);
		if (existingTimer) {
			window.clearTimeout(existingTimer);
			wrapper.dataset.abwRestoreTimer = '';
		}
	} else {
		wrapper.abwEntranceCompleted = false;
	}

	const animations = animateTargets(
		targets,
		keyframes,
		{
			duration,
			delay,
			stagger: effectiveStagger,
			easing: wrapper.dataset.ffawEasing || 'ease-out',
			iterations,
			fill: fillMode,
			exitMode,
		},
		reverse
	);
	wrapper.abwAnimations = animations;

	if (isTextContent && !reverse) {
		scheduleTextRestore(wrapper, duration, delay, effectiveStagger, targets.length, shouldLoop);
	}

	if (!reverse && iterations !== Infinity && animations.length) {
		Promise.allSettled(
			animations.map((animation) => animation.finished.catch(() => undefined))
		).then(() => {
			const completedCleanly = animations.every((animation) => animation.playState === 'finished');
			if (completedCleanly) {
				wrapper.abwEntranceCompleted = true;
			}
		});
	}

	if (typeof config.onComplete === 'function' && iterations !== Infinity && animations.length) {
		Promise.allSettled(
			animations.map((animation) => animation.finished.catch(() => undefined))
		).then(() => {
			// Canceled plays (e.g. hover re-enter mid-exit) reject finished; skip side effects.
			const completedCleanly = animations.every((animation) => animation.playState === 'finished');
			if (!completedCleanly) {
				return;
			}
			// Exit finished, but the trigger condition may already be false again
			// (pointer re-entered, scrolled back into view, etc.).
			if (typeof config.shouldProceed === 'function' && !config.shouldProceed()) {
				return;
			}
			config.onComplete?.();
		});
	}
}

/* -------------------------------------------------------------------------- */
/* Exit pipeline                                                              */
/* -------------------------------------------------------------------------- */

/**
 * True once any target has left its delay phase (or finished). During delay with
 * fill:both the element still shows the entrance "from" frame — exiting then would
 * animate as if the entrance already ran.
 */
function hasEntranceVisuallyStarted(wrapper: WrapperElement): boolean {
	if (wrapper.abwEntranceCompleted) {
		return true;
	}
	const animations = Array.isArray(wrapper.abwAnimations) ? wrapper.abwAnimations : [];
	if (!animations.length) {
		return false;
	}
	return animations.some((animation) => {
		if (animation.playState === 'finished') {
			return true;
		}
		const currentTime = animation.currentTime;
		if (currentTime === null) {
			return false;
		}
		let delay = 0;
		if (animation.effect && typeof animation.effect.getTiming === 'function') {
			delay = Number(animation.effect.getTiming().delay) || 0;
		}
		return Number(currentTime) >= delay;
	});
}

function hasEntranceFullyCompleted(wrapper: WrapperElement): boolean {
	if (wrapper.abwEntranceCompleted) {
		return true;
	}
	const animations = Array.isArray(wrapper.abwAnimations) ? wrapper.abwAnimations : [];
	if (!animations.length) {
		return false;
	}
	return animations.every((animation) => animation.playState === 'finished');
}

function clearQueuedExit(wrapper: WrapperElement): void {
	wrapper.abwExitQueued = false;
	wrapper.abwExitQueueToken = (wrapper.abwExitQueueToken || 0) + 1;
}

function queueExitAfterEntrance(wrapper: WrapperElement, config: PlayConfig = {}): void {
	const animations = Array.isArray(wrapper.abwAnimations) ? wrapper.abwAnimations : [];
	if (!animations.length) {
		cancelPendingEntrance(wrapper, config);
		return;
	}

	const token = (wrapper.abwExitQueueToken || 0) + 1;
	wrapper.abwExitQueueToken = token;
	wrapper.abwExitQueued = true;

	Promise.allSettled(
		animations.map((animation) => animation.finished.catch(() => undefined))
	).then(() => {
		if (wrapper.abwExitQueueToken !== token || !wrapper.abwExitQueued) {
			return;
		}
		wrapper.abwExitQueued = false;

		if (typeof config.shouldProceed === 'function' && !config.shouldProceed()) {
			return;
		}

		const completedCleanly = animations.every((animation) => animation.playState === 'finished');
		if (!completedCleanly) {
			cancelPendingEntrance(wrapper, config);
			return;
		}

		wrapper.abwEntranceCompleted = true;
		playExitAnimation(wrapper, config);
	});
}

function enforceInitialInvisibleState(wrapper: WrapperElement, config: PlayConfig = {}): void {
	const animationState = resolveWrapperAnimationState(wrapper, config.directionOverride);
	const targets = mergeFollowTargets(
		wrapper,
		getAnimationTargets(wrapper, {
			contentKind: animationState.contentKind,
			textGranularity: animationState.textGranularity,
		})
	);

	if (!keyframesStartHidden(animationState.keyframes)) {
		targets.forEach((target) => clearInlineState(target));
		return;
	}

	targets.forEach((target) => applyInitialState(target, animationState.keyframes));
}

function cancelPendingEntrance(wrapper: WrapperElement, config: PlayConfig = {}): void {
	clearQueuedExit(wrapper);
	cancelWrapperAnimations(wrapper);
	wrapper.abwEntranceCompleted = false;

	if (typeof config.onSkipped === 'function') {
		config.onSkipped();
		return;
	}

	enforceInitialInvisibleState(wrapper, config);
}

function playExitAnimation(wrapper: WrapperElement, config: PlayConfig = {}): boolean | 'queued' {
	// Still in delay / never started: cancel and restore the primed invisible state.
	if (!hasEntranceVisuallyStarted(wrapper)) {
		cancelPendingEntrance(wrapper, config);
		return false;
	}

	// Entrance is mid-flight: let it finish, then exit (full cycle, not interrupted).
	if (!hasEntranceFullyCompleted(wrapper)) {
		queueExitAfterEntrance(wrapper, config);
		return 'queued';
	}

	clearQueuedExit(wrapper);
	wrapper.abwEntranceCompleted = false;
	animateChildren(wrapper, true, {
		...config,
		exitMode: config.exitMode || normalizeExitMode(wrapper.dataset.ffawExitMode || 'rewind'),
	});
	return true;
}

/* -------------------------------------------------------------------------- */
/* Viewport helpers                                                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

function clearRestTargets(wrapper: WrapperElement, directionOverride?: Direction): void {
	const animationState = resolveWrapperAnimationState(wrapper, directionOverride);
	const restTargets = mergeFollowTargets(
		wrapper,
		getAnimationTargets(wrapper, {
			contentKind: animationState.contentKind,
			textGranularity: animationState.textGranularity,
		})
	);
	restTargets.forEach((target) => clearInlineState(target));
	wrapper.abwEntranceCompleted = true;
}

export function setupAnimationWrapper(element: HTMLElement, rawOptions: AnimationOptions = {}): AnimationRuntimeHandle {
	const wrapper = element as WrapperElement;
	let baseRawOptions = rawOptions;
	let optionsAtList = rawOptions.optionsAt ?? [];
	let options = normalizeAnimationOptions(applyOptionsAt(baseRawOptions, optionsAtList));
	let cleanupCallbacks: Array<() => void> = [];

	const resolveOptions = () => normalizeAnimationOptions(applyOptionsAt(baseRawOptions, optionsAtList));

	const observerConfigChanged = (next: NormalizedAnimationOptions) => {
		return next.threshold !== options.threshold
			|| next.rootMargin !== options.rootMargin
			|| next.trigger !== options.trigger
			|| next.animationMode !== options.animationMode;
	};

	const cleanup = () => {
		cleanupCallbacks.forEach((callback) => callback());
		cleanupCallbacks = [];
		cancelWrapperAnimations(wrapper);
		const animationState = resolveWrapperAnimationState(wrapper);
		const targets = mergeFollowTargets(
			wrapper,
			getAnimationTargets(wrapper, {
				contentKind: animationState.contentKind,
				textGranularity: animationState.textGranularity,
			})
		);
		targets.forEach((target) => clearInlineState(target));
		wrapper.classList.remove('abw-hover-armed', 'abw-hide-until-hover');
		wrapper.abwEntranceCompleted = false;
		clearQueuedExit(wrapper);
		restoreTextSplits(wrapper);
	};

	const attach = () => {
		cleanup();
		options = resolveOptions();
		// Serialize the resolved (optionsAt-applied) values — animateChildren /
		// resolveWrapperAnimationState read preset/direction/duration/etc from dataset.
		applyDataAttributes(wrapper, { ...options, optionsAt: optionsAtList });

		Array.from(wrapper.classList).forEach((className) => {
			if (className.startsWith('abw-preset-') || className.startsWith('abw-trigger-') || className.startsWith('abw-kind-')) {
				wrapper.classList.remove(className);
			}
		});
		wrapper.classList.add(
			'abw-wrapper',
			`abw-preset-${options.preset}`,
			`abw-trigger-${options.trigger}`,
			`abw-kind-${options.contentKind}`
		);
		syncPendingClass(wrapper, applyOptionsAt(baseRawOptions, optionsAtList));

		if (optionsAtList.length) {
			cleanupCallbacks.push(subscribeOptionsAt(optionsAtList, () => refreshResolvedOptions(true)));
		}

		if (!canAnimate() || prefersReducedMotion()) {
			wrapper.classList.add('abw-reduced-motion');
			clearPendingClass(wrapper);
			return;
		}

		if (options.trigger === 'scroll-media') {
			return;
		}

		const trigger = options.trigger;
		const animationMode = options.animationMode;
		const playsIn = animationModeIncludesIn(animationMode);
		const playsOut = animationModeIncludesOut(animationMode);
		const once = options.once;
		const threshold = options.threshold;
		const hideUntilHoverEnabled = options.hideUntilHover;
		const configuredDirection = options.direction;
		const usesScrollLinkedDirection =
			configuredDirection === 'scroll' || configuredDirection === 'scroll-reverse';
		if (usesScrollLinkedDirection) {
			attachScrollDirectionTracker();
		}
		const resolveDirectionOverride = (): Direction | undefined => {
			if (!usesScrollLinkedDirection) {
				return undefined;
			}
			return resolveScrollLinkedDirection(configuredDirection);
		};

		// Nested wrappers driven by their parent do not attach their own trigger.
		if (trigger === 'inherit' || options.followParentAnimation) {
			if (options.followParentAnimation && playsIn && animationMode !== 'out') {
				enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
			}
			clearPendingClass(wrapper);
			return;
		}

		const initialAnimationState = resolveWrapperAnimationState(wrapper, resolveDirectionOverride());
		const startsHidden = keyframesStartHidden(initialAnimationState.keyframes);

		// Hover entrances that start hidden must be primed on load when Hide until hover
		// is on — otherwise content stays visible until the first mouse interaction.
		const shouldPrimeHoverInvisible =
			trigger === 'hover' && playsIn && startsHidden && hideUntilHoverEnabled;
		if (shouldPrimeHoverInvisible) {
			wrapper.classList.add('abw-hide-until-hover');
		} else {
			wrapper.classList.remove('abw-hide-until-hover');
		}

		const shouldPrimeInitialState =
			(shouldPrimeHoverInvisible || (playsIn && ['scroll', 'load', 'click', 'loop'].includes(trigger))) &&
			animationMode !== 'out';
		if (shouldPrimeInitialState) {
			enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
		} else if (animationMode === 'out') {
			// Out-only starts at rest (visible), then exits on leave/toggle.
			clearRestTargets(wrapper, resolveDirectionOverride());
		}
		clearPendingClass(wrapper);

		let playCount = 0;
		const triggerWrapperAnimation = (config: PlayConfig = {}) => {
			clearQueuedExit(wrapper);
			if (trigger === 'hover') {
				wrapper.classList.add('abw-hover-armed');
				wrapper.classList.remove('abw-hide-until-hover');
			}
			clearPendingClass(wrapper);
			playCount += 1;
			animateChildren(wrapper, false, {
				...config,
				directionOverride: config.directionOverride || resolveDirectionOverride(),
			});
			if (playCount > 1 && !config.fromParentReplay) {
				const nestedWrappers = wrapper.querySelectorAll<WrapperElement>('.abw-wrapper');
				nestedWrappers.forEach((nestedWrapper) => {
					if (nestedWrapper === wrapper || typeof nestedWrapper.abwReplay !== 'function') {
						return;
					}
					const nestedParent = nestedWrapper.parentElement?.closest<HTMLElement>('.abw-wrapper');
					if (nestedParent !== wrapper) {
						return;
					}
					const nestedTrigger = nestedWrapper.dataset.ffawTrigger || 'scroll';
					if (nestedTrigger === 'loop') {
						nestedWrapper.abwReplay({ fromParentReplay: true, startDelay: 0 });
						return;
					}
					if (nestedTrigger !== 'scroll') {
						return;
					}
					const nestedThreshold = Number(nestedWrapper.dataset.ffawThreshold || 0.25);
					if (!isWrapperInViewport(nestedWrapper, nestedThreshold)) {
						return;
					}
					nestedWrapper.abwReplay({ fromParentReplay: true });
				});
			}
		};
		wrapper.abwReplay = (config: PlayConfig = {}) => triggerWrapperAnimation(config);

		if (trigger === 'load') {
			const id = window.requestAnimationFrame(() => triggerWrapperAnimation());
			cleanupCallbacks.push(() => window.cancelAnimationFrame(id));
			return;
		}

		if (trigger === 'hover') {
			const restoreInvisibleIdle = () => {
				if (wrapper.matches(':hover')) {
					return;
				}
				wrapper.classList.remove('abw-hover-armed');
				if (animationMode === 'out') {
					clearRestTargets(wrapper, resolveDirectionOverride());
					return;
				}
				if (shouldPrimeHoverInvisible) {
					wrapper.classList.add('abw-hide-until-hover');
				}
				enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
			};
			const onEnter = () => {
				clearQueuedExit(wrapper);
				if (!playsIn) {
					wrapper.classList.add('abw-hover-armed');
					wrapper.classList.remove('abw-hide-until-hover');
					clearRestTargets(wrapper, resolveDirectionOverride());
					return;
				}
				triggerWrapperAnimation();
			};
			const onLeave = () => {
				if (!playsOut) {
					if (shouldPrimeHoverInvisible) {
						cancelPendingEntrance(wrapper, {
							directionOverride: resolveDirectionOverride(),
							onSkipped: restoreInvisibleIdle,
						});
					}
					return;
				}
				playExitAnimation(wrapper, {
					directionOverride: resolveDirectionOverride(),
					shouldProceed: () => !wrapper.matches(':hover'),
					onSkipped: restoreInvisibleIdle,
					onComplete: restoreInvisibleIdle,
				});
			};
			wrapper.addEventListener('mouseenter', onEnter);
			wrapper.addEventListener('mouseleave', onLeave);
			cleanupCallbacks.push(() => {
				wrapper.removeEventListener('mouseenter', onEnter);
				wrapper.removeEventListener('mouseleave', onLeave);
			});
			return;
		}

		if (trigger === 'click') {
			let isOn = animationMode === 'out';
			const clickToggle = options.clickToggle || animationMode === 'both' || animationMode === 'out';
			const restoreAfterOut = () => {
				if (animationMode === 'out') {
					clearRestTargets(wrapper, resolveDirectionOverride());
					return;
				}
				enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
			};
			const onClick = () => {
				if (animationMode === 'out') {
					wrapper.abwEntranceCompleted = true;
					playExitAnimation(wrapper, {
						directionOverride: resolveDirectionOverride(),
						onSkipped: restoreAfterOut,
						onComplete: restoreAfterOut,
					});
					return;
				}
				if (!clickToggle && animationMode === 'in') {
					triggerWrapperAnimation();
					return;
				}
				isOn = !isOn;
				if (isOn) {
					clearQueuedExit(wrapper);
					triggerWrapperAnimation();
					return;
				}
				if (!playsOut) {
					return;
				}
				const exitResult = playExitAnimation(wrapper, {
					directionOverride: resolveDirectionOverride(),
					shouldProceed: () => !isOn,
					onSkipped: restoreAfterOut,
					onComplete: restoreAfterOut,
				});
				if (exitResult === false) {
					isOn = false;
				}
			};
			wrapper.addEventListener('click', onClick);
			cleanupCallbacks.push(() => wrapper.removeEventListener('click', onClick));
			return;
		}

		if (trigger === 'loop' || options.loop) {
			const initialDelay = resolveInheritedDelay(wrapper, Number(wrapper.dataset.ffawDelay || 0));
			const timer = window.setTimeout(() => {
				if (typeof document !== 'undefined' && document.body && !document.body.contains(wrapper)) {
					return;
				}
				triggerWrapperAnimation({ startDelay: 0 });
			}, initialDelay);
			cleanupCallbacks.push(() => window.clearTimeout(timer));
			return;
		}

		if (trigger === 'scroll' && typeof window.IntersectionObserver === 'function') {
			let hasPlayed = false;
			let isInView = false;
			let rafCheck = 0;
			const meetsThreshold = (entry: IntersectionObserverEntry) =>
				!!entry.isIntersecting && Number(entry.intersectionRatio || 0) >= threshold;
			const detachManualCheck = () => {
				window.removeEventListener('scroll', scheduleManualCheck);
				window.removeEventListener('resize', scheduleManualCheck);
				if (rafCheck) {
					window.cancelAnimationFrame(rafCheck);
					rafCheck = 0;
				}
			};
			const runManualInViewCheck = () => {
				rafCheck = 0;
				if (typeof document !== 'undefined' && document.body && !document.body.contains(wrapper)) {
					detachManualCheck();
					return;
				}
				if (isInView) {
					return;
				}
				if (isWrapperInViewport(wrapper, threshold)) {
					isInView = true;
					hasPlayed = true;
					clearQueuedExit(wrapper);
					if (playsIn) {
						triggerWrapperAnimation();
					} else if (animationMode === 'out') {
						clearRestTargets(wrapper, resolveDirectionOverride());
					}
					if (once && !playsOut) {
						observer.unobserve(wrapper);
						detachManualCheck();
					}
				}
			};
			const scheduleManualCheck = () => {
				if (rafCheck) {
					return;
				}
				rafCheck = window.requestAnimationFrame(runManualInViewCheck);
			};

			const observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (meetsThreshold(entry)) {
							if (isInView) {
								return;
							}
							isInView = true;
							clearQueuedExit(wrapper);
							if (playsIn) {
								triggerWrapperAnimation();
							} else if (animationMode === 'out') {
								clearRestTargets(wrapper, resolveDirectionOverride());
							}
							hasPlayed = true;
							if (once && !playsOut) {
								observer.unobserve(wrapper);
								detachManualCheck();
							}
						} else if (isInView) {
							isInView = false;
							if (!playsOut) {
								return;
							}
							if ((once && animationMode === 'in') || !hasPlayed) {
								return;
							}
							playExitAnimation(wrapper, {
								directionOverride: resolveDirectionOverride(),
								shouldProceed: () => !isInView,
								onSkipped: () => {
									if (animationMode === 'out') {
										clearRestTargets(wrapper, resolveDirectionOverride());
										return;
									}
									enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
								},
								onComplete: () => {
									if (animationMode === 'out') {
										// Stay at exited end-state until next enter resets to rest.
										return;
									}
									enforceInitialInvisibleState(wrapper, { directionOverride: resolveDirectionOverride() });
								},
							});
						}
					});
				},
				{ threshold: [0, threshold, 1], rootMargin: options.rootMargin || '0px' }
			);
			observer.observe(wrapper);
			cleanupCallbacks.push(() => observer.disconnect());
			window.addEventListener('scroll', scheduleManualCheck, { passive: true });
			window.addEventListener('resize', scheduleManualCheck);
			cleanupCallbacks.push(detachManualCheck);

			// Above-the-fold wrappers can miss an immediate threshold callback on some layouts.
			scheduleManualCheck();
			return;
		}

		if (trigger === 'scroll') {
			const onScroll = () => {
				if (isWrapperInViewport(wrapper, threshold) && (!once || playCount < 1) && playsIn) {
					triggerWrapperAnimation();
				}
			};
			window.addEventListener('scroll', onScroll, { passive: true });
			window.addEventListener('resize', onScroll, { passive: true });
			onScroll();
			cleanupCallbacks.push(() => {
				window.removeEventListener('scroll', onScroll);
				window.removeEventListener('resize', onScroll);
			});
			return;
		}

		triggerWrapperAnimation();
	};

	const refreshResolvedOptions = (reattachIfNeeded = false) => {
		const next = resolveOptions();
		const needsReattach = reattachIfNeeded && observerConfigChanged(next);
		options = next;
		applyDataAttributes(wrapper, { ...options, optionsAt: optionsAtList });
		syncPendingClass(wrapper, applyOptionsAt(baseRawOptions, optionsAtList));

		if (needsReattach) {
			attach();
			return;
		}

		if (wrapper.abwEntranceCompleted) {
			return;
		}

		if (options.animationMode !== 'out' && animationModeIncludesIn(options.animationMode)) {
			const configuredDirection = options.direction;
			const directionOverride = configuredDirection === 'scroll' || configuredDirection === 'scroll-reverse'
				? resolveScrollLinkedDirection(configuredDirection)
				: undefined;
			enforceInitialInvisibleState(wrapper, { directionOverride });
			clearPendingClass(wrapper);
		}
	};

	attach();

	return {
		update(nextOptions: AnimationOptions) {
			baseRawOptions = nextOptions;
			optionsAtList = nextOptions.optionsAt ?? [];
			attach();
		},
		destroy() {
			cleanup();
			delete wrapper.abwReplay;
		},
	};
}

function optionsFromDataset(wrapper: HTMLElement): AnimationOptions {
	return {
		preset: wrapper.dataset.ffawPreset as AnimationOptions['preset'],
		contentKind: wrapper.dataset.ffawContentKind as AnimationOptions['contentKind'],
		trigger: wrapper.dataset.ffawTrigger as AnimationOptions['trigger'],
		animationMode: wrapper.dataset.ffawAnimationMode as AnimationMode,
		exitMode: wrapper.dataset.ffawExitMode as ExitMode,
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
		rootMargin: wrapper.dataset.ffawRootMargin || '',
		loop: wrapper.dataset.ffawLoop === '1',
		clickToggle: wrapper.dataset.ffawClickToggle === '1',
		hideUntilHover: wrapper.dataset.ffawHideUntilHover === '1',
		inheritParentDelay: wrapper.dataset.ffawInheritParentDelay === '1',
		followParentAnimation: wrapper.dataset.ffawFollowParentAnimation === '1',
		textGranularity: wrapper.dataset.ffawTextGranularity as AnimationOptions['textGranularity'],
		optionsAt: parseOptionsAtAttribute(wrapper.dataset.ffawOptionsAt),
	};
}

export function initAnimationWrappers(root: ParentNode = document): AnimationRuntimeHandle[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.abw-wrapper')).map((wrapper) => {
		return setupAnimationWrapper(wrapper, optionsFromDataset(wrapper));
	});
}

/* -------------------------------------------------------------------------- */
/* Test hooks                                                                 */
/* -------------------------------------------------------------------------- */

function resolveOnceOption(wrapper: HTMLElement): boolean {
	return wrapper.dataset.ffawOnce !== '0';
}

function getAnimationTargetsCompat(
	wrapper: HTMLElement,
	presetOrOptions?: string | TargetOptions,
	textGranularity?: string
): HTMLElement[] {
	if (presetOrOptions && typeof presetOrOptions === 'object') {
		return getAnimationTargets(wrapper, presetOrOptions);
	}
	const contentKind = (wrapper.dataset.ffawContentKind as ContentKind) || 'mixed';
	const granularity = ((textGranularity as TextGranularity)
		|| (wrapper.dataset.ffawTextGranularity as TextGranularity)
		|| 'word');
	return getAnimationTargets(wrapper, { contentKind, textGranularity: granularity });
}

/**
 * Pure and DOM helpers exposed for the jsdom test suite (and advanced consumers).
 * Not part of the stable public API surface.
 */
export const __testHooks = {
	deriveExitKeyframes,
	normalizeExitMode,
	resolveAnimationMode,
	resolveOnceOption,
	animationModeIncludesIn,
	animationModeIncludesOut,
	keyframesStartHidden,
	resolvePresetKeyframes,
	normalizePresetSettings,
	applyIntensityToKeyframes,
	getAnimationTargets: getAnimationTargetsCompat,
	mergeFollowTargets,
	getParentFollowWrapperTargets,
	getDirectChildTargets,
	resolveInheritedDelay,
	hasEntranceVisuallyStarted,
	hasEntranceFullyCompleted,
	playExitAnimation,
	enforceInitialInvisibleState,
	cancelPendingEntrance,
	clearQueuedExit,
	animateChildren,
	setupWrapper: (wrapper: HTMLElement) => setupAnimationWrapper(wrapper, optionsFromDataset(wrapper)),
	setupAnimationWrapper,
	initAnimationWrappers,
};
