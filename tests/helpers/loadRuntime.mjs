import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '../../dist');
const STYLE_SOURCE = readFileSync(join(DIST_DIR, 'styles.css'), 'utf8');

// The runtime only touches the DOM inside function bodies via global lookups, so
// we can load the built ESM module once and re-point globals per createRuntime().
const runtimeModule = await import(pathToFileURL(join(DIST_DIR, 'runtime.js')).href);

function installAnimateMock(window) {
	window.__ABW_ANIMATE_CALLS__ = [];
	window.Element.prototype.animate = function animate(keyframes, options = {}) {
		const delay = Number(options.delay) || 0;
		const duration = Number(options.duration) || 0;
		const startedAt = Date.now();
		let playState = 'running';
		let currentTime = 0;
		const record = {
			target: this,
			keyframes,
			options: { ...options, delay, duration },
		};
		window.__ABW_ANIMATE_CALLS__.push(record);
		const finished = new Promise((resolve) => {
			const total = delay + duration;
			setTimeout(() => {
				if (playState === 'running') {
					playState = 'finished';
					currentTime = total;
					resolve();
				}
			}, Math.min(Math.max(total, 1), 40));
		});
		return {
			finished,
			get playState() {
				return playState;
			},
			get currentTime() {
				if (playState === 'finished') {
					return delay + duration;
				}
				if (playState === 'idle') {
					return currentTime;
				}
				return Math.min(Date.now() - startedAt, delay + duration);
			},
			effect: {
				getTiming() {
					return { delay, duration };
				},
			},
			commitStyles() {},
			cancel() {
				playState = 'idle';
			},
		};
	};
}

function installMatchMedia(window) {
	window.matchMedia = window.matchMedia || function matchMedia() {
		return {
			matches: false,
			media: '',
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
		};
	};
}

function installMediaElementStubs(window) {
	const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
	if (!proto) {
		return;
	}
	proto.pause = function pause() {};
	proto.play = function play() {
		return Promise.resolve();
	};
	proto.load = function load() {};
}

function installIntersectionObserver(window) {
	window.__ABW_OBSERVERS__ = [];
	window.IntersectionObserver = class IntersectionObserver {
		constructor(callback) {
			this.callback = callback;
			this.elements = new Set();
			window.__ABW_OBSERVERS__.push(this);
		}
		observe(el) {
			this.elements.add(el);
		}
		unobserve(el) {
			this.elements.delete(el);
		}
		disconnect() {
			this.elements.clear();
		}
		trigger(entries) {
			this.callback(entries, this);
		}
	};
}

function installGlobals(window) {
	global.window = window;
	global.document = window.document;
	global.Element = window.Element;
	global.HTMLElement = window.HTMLElement;
	global.HTMLMediaElement = window.HTMLMediaElement;
	global.Node = window.Node;
	global.NodeFilter = window.NodeFilter;
	global.Event = window.Event;
	global.IntersectionObserver = window.IntersectionObserver;
	global.getComputedStyle = window.getComputedStyle.bind(window);
	global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
}

export function createRuntime(html = '<!DOCTYPE html><html><body></body></html>') {
	const dom = new JSDOM(html, {
		url: 'https://example.test/',
		pretendToBeVisual: true,
	});
	const { window } = dom;
	installAnimateMock(window);
	installMatchMedia(window);
	installMediaElementStubs(window);
	installIntersectionObserver(window);
	installGlobals(window);

	const style = window.document.createElement('style');
	style.textContent = STYLE_SOURCE;
	window.document.head.appendChild(style);

	return {
		window,
		document: window.document,
		abw: runtimeModule.__testHooks,
		dom,
		animateCalls: window.__ABW_ANIMATE_CALLS__,
		clearAnimateCalls() {
			window.__ABW_ANIMATE_CALLS__.length = 0;
		},
	};
}

export function stubInViewport(element, {
	width = 200,
	height = 100,
	top = 10,
	left = 10,
} = {}) {
	element.getBoundingClientRect = () => ({
		width,
		height,
		top,
		left,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON() {
			return {};
		},
	});
}

export function makeWrapper(document, {
	preset = 'fade',
	trigger = 'scroll',
	animationMode,
	exitMode,
	once,
	followParentAnimation = false,
	inheritParentDelay = false,
	hideUntilHover = false,
	contentKind = 'mixed',
	delay = 0,
	duration = 700,
	direction = 'up',
	className = '',
	html = '<p>Content</p>',
} = {}) {
	const el = document.createElement('div');
	el.className = `abw-wrapper ${className}`.trim();
	el.dataset.ffawPreset = preset;
	el.dataset.ffawTrigger = trigger;
	el.dataset.ffawContentKind = contentKind;
	el.dataset.ffawDirection = direction;
	el.dataset.ffawDelay = String(delay);
	el.dataset.ffawDuration = String(duration);
	el.dataset.ffawOnce = once === false ? '0' : '1';
	el.dataset.ffawFollowParentAnimation = followParentAnimation ? '1' : '0';
	el.dataset.ffawInheritParentDelay = inheritParentDelay ? '1' : '0';
	el.dataset.ffawHideUntilHover = hideUntilHover ? '1' : '0';
	if (animationMode) {
		el.dataset.ffawAnimationMode = animationMode;
	}
	if (exitMode) {
		el.dataset.ffawExitMode = exitMode;
	}
	el.innerHTML = html;
	return el;
}

export function computedOpacity(document, element) {
	return document.defaultView.getComputedStyle(element).opacity;
}
