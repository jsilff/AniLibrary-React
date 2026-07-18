import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	createRuntime,
	makeWrapper,
	computedOpacity,
	stubInViewport,
} from './helpers/loadRuntime.mjs';

function ids(nodes) {
	return Array.from(nodes, (node) => String(node.dataset.testId || node.tagName.toLowerCase()));
}

function tagTargets(nodes) {
	return Array.from(nodes).map((node) => node);
}

function isHidden(document, element) {
	return computedOpacity(document, element) === '0';
}

function buildThreeLevelStack(document, {
	outer = {},
	middle = {},
	scrub = {},
	copyText = 'Unified Intelligence',
} = {}) {
	const rise = makeWrapper(document, {
		preset: 'text-rise',
		trigger: 'scroll',
		animationMode: 'in',
		delay: 1900,
		html: '',
		...outer,
	});
	rise.dataset.testId = 'outer';
	const hover = makeWrapper(document, {
		preset: 'fade',
		trigger: 'hover',
		animationMode: 'both',
		exitMode: 'continue',
		delay: 500,
		hideUntilHover: true,
		html: '',
		...middle,
	});
	hover.dataset.testId = 'middle';
	const copy = document.createElement('p');
	copy.dataset.testId = 'copy';
	copy.textContent = copyText;
	const scrubWrap = makeWrapper(document, {
		preset: 'scroll-media',
		trigger: 'scroll-media',
		followParentAnimation: false,
		html: '<video data-test-id="vid"></video>',
		...scrub,
	});
	scrubWrap.dataset.testId = 'scrub';
	hover.append(copy, scrubWrap);
	rise.appendChild(hover);
	return { rise, hover, copy, scrub: scrubWrap };
}

describe('nested target matrix', () => {
	it('nested-only independent children fall back to shell targets', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { html: '' });
		const a = makeWrapper(document, { followParentAnimation: false, html: '<p>A</p>' });
		const b = makeWrapper(document, { followParentAnimation: false, html: '<p>B</p>' });
		a.dataset.testId = 'a';
		b.dataset.testId = 'b';
		outer.append(a, b);

		assert.deepEqual(ids(abw.getAnimationTargets(outer, 'fade', 'word')), ['a', 'b']);
	});

	it('plain sibling wins preferred set and leaves independent wrappers out', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { html: '' });
		const plain = document.createElement('p');
		plain.dataset.testId = 'plain';
		plain.textContent = 'Hello';
		const independent = makeWrapper(document, {
			followParentAnimation: false,
			html: '<p>Nested</p>',
		});
		independent.dataset.testId = 'independent';
		outer.append(plain, independent);

		assert.deepEqual(ids(abw.getAnimationTargets(outer, 'fade', 'word')), ['plain']);
	});

	it('joining + independent prefers joining only when preferred is non-empty', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { html: '' });
		const joining = makeWrapper(document, {
			followParentAnimation: true,
			html: '<p>Join</p>',
		});
		const independent = makeWrapper(document, {
			followParentAnimation: false,
			html: '<p>Solo</p>',
		});
		joining.dataset.testId = 'joining';
		independent.dataset.testId = 'independent';
		outer.append(joining, independent);

		assert.deepEqual(ids(abw.getAnimationTargets(outer, 'fade', 'word')), ['joining']);
	});

	it('does not pull grandchild follow wrappers into grandparent targets', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { html: '' });
		const middle = makeWrapper(document, {
			followParentAnimation: false,
			html: '',
		});
		middle.dataset.testId = 'middle';
		const inner = makeWrapper(document, {
			followParentAnimation: true,
			html: '<p>Inner</p>',
		});
		inner.dataset.testId = 'inner';
		middle.appendChild(inner);
		outer.appendChild(middle);

		assert.deepEqual(ids(abw.getAnimationTargets(outer, 'fade', 'word')), ['middle']);
		assert.deepEqual(ids(abw.getAnimationTargets(middle, 'fade', 'word')), ['inner']);
	});

	it('four-level stack resolves one shell per level by default', () => {
		const { document, abw } = createRuntime();
		const l1 = makeWrapper(document, { preset: 'fade', html: '' });
		const l2 = makeWrapper(document, { preset: 'fade', html: '' });
		const l3 = makeWrapper(document, { preset: 'fade', html: '' });
		const l4 = makeWrapper(document, { preset: 'fade', html: '<p data-test-id="leaf">Leaf</p>' });
		l1.dataset.testId = 'l1';
		l2.dataset.testId = 'l2';
		l3.dataset.testId = 'l3';
		l4.dataset.testId = 'l4';
		l3.appendChild(l4);
		l2.appendChild(l3);
		l1.appendChild(l2);

		assert.deepEqual(ids(abw.getAnimationTargets(l1, 'fade', 'word')), ['l2']);
		assert.deepEqual(ids(abw.getAnimationTargets(l2, 'fade', 'word')), ['l3']);
		assert.deepEqual(ids(abw.getAnimationTargets(l3, 'fade', 'word')), ['l4']);
		assert.deepEqual(ids(abw.getAnimationTargets(l4, 'fade', 'word')), ['leaf']);
	});

	it('text contentKind merges joining wrappers with split text units', () => {
		const { document, abw } = createRuntime();
		const parent = makeWrapper(document, {
			contentKind: 'text',
			html: '',
		});
		const heading = document.createElement('p');
		heading.textContent = 'Hello world';
		const joining = makeWrapper(document, {
			followParentAnimation: true,
			html: '<span>Extra</span>',
		});
		joining.dataset.testId = 'joining';
		parent.append(heading, joining);

		const targets = abw.getAnimationTargets(parent, 'fade', 'word');
		assert.ok(targets.some((node) => node.classList.contains('abw-text-unit')));
		assert.ok(targets.includes(joining));
	});

	it('mixed block with nested wrapper is skipped when a plain sibling exists', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { html: '' });
		const plain = document.createElement('p');
		plain.dataset.testId = 'plain';
		plain.textContent = 'Visible';
		const mixed = document.createElement('div');
		mixed.dataset.testId = 'mixed';
		mixed.appendChild(makeWrapper(document, { html: '<p>Inside</p>' }));
		outer.append(plain, mixed);

		assert.deepEqual(ids(abw.getAnimationTargets(outer, 'fade', 'word')), ['plain']);
	});

	it('user three-level stack: outer→middle shell; middle→copy only when scrub independent', () => {
		const { document, abw } = createRuntime();
		const { rise, hover, copy, scrub } = buildThreeLevelStack(document);

		assert.deepEqual(ids(abw.getAnimationTargets(rise, 'text-rise', 'word')), ['middle']);
		const middleTargets = abw.getAnimationTargets(hover, 'fade', 'word');
		assert.ok(middleTargets.includes(copy));
		assert.ok(!middleTargets.includes(scrub));
	});

	it('empty wrapper yields no targets', () => {
		const { document, abw } = createRuntime();
		const empty = makeWrapper(document, { html: '' });
		assert.equal(abw.getAnimationTargets(empty, 'fade', 'word').length, 0);
	});
});

describe('inherit delay nested configs', () => {
	it('inner inheriting middle without middle inheriting outer only adds middle', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { delay: 1000, html: '' });
		const middle = makeWrapper(document, {
			delay: 400,
			inheritParentDelay: false,
			html: '',
		});
		const inner = makeWrapper(document, {
			delay: 200,
			inheritParentDelay: true,
			html: '<p>Inner</p>',
		});
		middle.appendChild(inner);
		outer.appendChild(middle);
		document.body.appendChild(outer);

		assert.equal(abw.resolveInheritedDelay(inner, 200), 600);
		assert.equal(abw.resolveInheritedDelay(middle, 400), 400);
	});

	it('inherits across an intervening non-wrapper element via closest()', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { delay: 800, html: '' });
		const spacer = document.createElement('div');
		const child = makeWrapper(document, {
			delay: 100,
			inheritParentDelay: true,
			html: '<p>Child</p>',
		});
		spacer.appendChild(child);
		outer.appendChild(spacer);
		document.body.appendChild(outer);

		assert.equal(abw.resolveInheritedDelay(child, 100), 900);
	});

	it('zero parent delay with inherit still returns own delay', () => {
		const { document, abw } = createRuntime();
		const parent = makeWrapper(document, { delay: 0, html: '' });
		const child = makeWrapper(document, {
			delay: 250,
			inheritParentDelay: true,
			html: '<p>Child</p>',
		});
		parent.appendChild(child);
		document.body.appendChild(parent);
		assert.equal(abw.resolveInheritedDelay(child, 250), 250);
	});

	it('match-parent-timing on middle of three-level stack stacks outer+middle', () => {
		const { document, abw } = createRuntime();
		const { rise, hover } = buildThreeLevelStack(document, {
			outer: { delay: 1900 },
			middle: { delay: 500, inheritParentDelay: true },
		});
		document.body.appendChild(rise);
		assert.equal(abw.resolveInheritedDelay(hover, 500), 2400);
	});
});

describe('hide-until-hover nested visibility matrix', () => {
	it('three-level stack hides copy, keeps independent scrub visible', () => {
		const { document, abw } = createRuntime();
		const { rise, hover, copy, scrub } = buildThreeLevelStack(document);
		document.body.appendChild(rise);
		abw.setupWrapper(hover);

		assert.ok(hover.classList.contains('abw-hide-until-hover'));
		assert.equal(isHidden(document, copy), true);
		assert.equal(isHidden(document, scrub), false);
	});

	it('joining scrub under hide-until-hover is hidden until hover arms and plays', () => {
		const { document, abw, window } = createRuntime();
		const { rise, hover, copy, scrub } = buildThreeLevelStack(document, {
			middle: { delay: 0, duration: 20 },
			scrub: { followParentAnimation: true, preset: 'fade', trigger: 'scroll' },
		});
		document.body.appendChild(rise);
		abw.setupWrapper(hover);

		assert.equal(isHidden(document, copy), true);
		assert.equal(isHidden(document, scrub), true);

		// Joining children are animation targets, so they also get inline opacity:0
		// while primed. Arming + entrance clears that and drops the CSS hide class.
		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		assert.ok(hover.classList.contains('abw-hover-armed'));
		assert.ok(!hover.classList.contains('abw-hide-until-hover'));
		assert.notEqual(scrub.style.opacity, '0');
	});

	it('nested hover in-only does not prime hide when Hide until hover is off', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'in',
			hideUntilHover: false,
			html: '<p>Only in</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		assert.ok(!hover.classList.contains('abw-hide-until-hover'));
	});

	it('nested hover in-only still primes hide-until-hover when enabled', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'in',
			hideUntilHover: true,
			html: '<p>Only in</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		assert.ok(hover.classList.contains('abw-hide-until-hover'));
	});

	it('nested hover out-only does not prime hide-until-hover', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'out',
			hideUntilHover: true,
			html: '<p>Only out</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		assert.ok(!hover.classList.contains('abw-hide-until-hover'));
	});
});

describe('runtime nested play / exit behaviors', () => {
	it('outer animateChildren animates middle shell, not deep copy', () => {
		const { document, abw, clearAnimateCalls, animateCalls } = createRuntime();
		const { rise, hover, copy } = buildThreeLevelStack(document);
		document.body.appendChild(rise);
		clearAnimateCalls();
		abw.animateChildren(rise, false, { startDelay: 0 });

		const targets = animateCalls.map((call) => call.target);
		assert.ok(targets.includes(hover));
		assert.ok(!targets.includes(copy));
	});

	it('middle hover enter/leave both with continue queues cleanly around independent scrub', async () => {
		const { document, abw, window } = createRuntime();
		const { rise, hover, scrub } = buildThreeLevelStack(document, {
			middle: { delay: 0, duration: 30, hideUntilHover: true, exitMode: 'continue' },
		});
		document.body.appendChild(rise);
		abw.setupWrapper(hover);
		abw.setupWrapper(scrub);

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		assert.ok((hover.abwAnimations || []).length > 0);
		assert.equal((scrub.abwAnimations || []).length, 0);

		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
		assert.equal(hover.abwExitQueued, true);

		await Promise.all(
			(hover.abwAnimations || []).map((animation) => animation.finished.catch(() => undefined))
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(hover.abwExitQueued, false);
		assert.equal((scrub.abwAnimations || []).length, 0);
	});

	it('nested hover leave during delay restores idle without starting exit', () => {
		const { document, abw, window } = createRuntime();
		const { rise, hover } = buildThreeLevelStack(document, {
			middle: { delay: 5000, duration: 40, hideUntilHover: true },
		});
		document.body.appendChild(rise);
		abw.setupWrapper(hover);

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		assert.equal(abw.hasEntranceVisuallyStarted(hover), false);
		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
		assert.equal(abw.hasEntranceVisuallyStarted(hover), false);
		assert.ok(hover.classList.contains('abw-hide-until-hover'));
	});

	it('parent replay cascades to nested scroll in viewport but not hover or out-of-view scroll', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			delay: 0,
			duration: 20,
			html: '',
		});
		const nestedScroll = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			delay: 0,
			duration: 20,
			html: '<p>Scroll child</p>',
		});
		const nestedHover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			html: '<p>Hover child</p>',
		});
		const offscreenScroll = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			html: '<p>Off</p>',
		});
		nestedScroll.dataset.testId = 'nested-scroll';
		nestedHover.dataset.testId = 'nested-hover';
		offscreenScroll.dataset.testId = 'offscreen';
		outer.append(nestedScroll, nestedHover, offscreenScroll);
		document.body.appendChild(outer);

		abw.setupWrapper(outer);
		abw.setupWrapper(nestedScroll);
		abw.setupWrapper(nestedHover);
		abw.setupWrapper(offscreenScroll);

		stubInViewport(nestedScroll);
		offscreenScroll.getBoundingClientRect = () => ({
			width: 100,
			height: 40,
			top: 5000,
			left: 0,
			right: 100,
			bottom: 5040,
			x: 0,
			y: 5000,
			toJSON() {
				return {};
			},
		});

		let scrollReplays = 0;
		let hoverReplays = 0;
		let offscreenReplays = 0;
		const originalScroll = nestedScroll.abwReplay;
		const originalHover = nestedHover.abwReplay;
		const originalOff = offscreenScroll.abwReplay;
		nestedScroll.abwReplay = (config) => {
			scrollReplays += 1;
			return originalScroll(config);
		};
		nestedHover.abwReplay = (config) => {
			hoverReplays += 1;
			return originalHover(config);
		};
		offscreenScroll.abwReplay = (config) => {
			offscreenReplays += 1;
			return originalOff(config);
		};

		// First play does not cascade (playCount must exceed 1).
		outer.abwReplay();
		assert.equal(scrollReplays, 0);

		outer.abwReplay();
		assert.equal(scrollReplays, 1);
		assert.equal(hoverReplays, 0);
		assert.equal(offscreenReplays, 0);
	});

	it('fromParentReplay does not re-cascade to grandchildren', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			trigger: 'scroll',
			delay: 0,
			duration: 15,
			html: '',
		});
		const middle = makeWrapper(document, {
			trigger: 'scroll',
			delay: 0,
			duration: 15,
			html: '',
		});
		const inner = makeWrapper(document, {
			trigger: 'scroll',
			delay: 0,
			duration: 15,
			html: '<p>Inner</p>',
		});
		middle.appendChild(inner);
		outer.appendChild(middle);
		document.body.appendChild(outer);
		abw.setupWrapper(outer);
		abw.setupWrapper(middle);
		abw.setupWrapper(inner);
		stubInViewport(middle);
		stubInViewport(inner);

		let innerReplays = 0;
		const originalInner = inner.abwReplay;
		inner.abwReplay = (config) => {
			innerReplays += 1;
			return originalInner(config);
		};

		outer.abwReplay();
		outer.abwReplay();
		// Middle replays with fromParentReplay:true, so it must not cascade to inner.
		assert.equal(innerReplays, 0);
	});

	it('joining child is animated with parent entrance when follow is on', () => {
		const { document, abw, clearAnimateCalls, animateCalls } = createRuntime();
		const parent = makeWrapper(document, {
			preset: 'fade',
			delay: 0,
			duration: 20,
			html: '',
		});
		const plain = document.createElement('p');
		plain.dataset.testId = 'plain';
		plain.textContent = 'Hello';
		const joining = makeWrapper(document, {
			followParentAnimation: true,
			html: '<p>Join</p>',
		});
		joining.dataset.testId = 'joining';
		parent.append(plain, joining);
		document.body.appendChild(parent);
		clearAnimateCalls();
		abw.animateChildren(parent, false, { startDelay: 0 });

		const targets = animateCalls.map((call) => call.target);
		assert.ok(targets.includes(plain));
		assert.ok(targets.includes(joining));
	});
});

describe('nested config smoke matrix', () => {
	const modes = ['in', 'out', 'both'];
	const exitModes = ['rewind', 'continue'];
	const follows = [false, true];
	const inherits = [false, true];

	for (const animationMode of modes) {
		for (const exitMode of exitModes) {
			it(`setup survives hover ${animationMode}/${exitMode} under scroll outer`, () => {
				const { document, abw } = createRuntime();
				const outer = makeWrapper(document, {
					preset: 'text-rise',
					trigger: 'scroll',
					animationMode: 'in',
					html: '',
				});
				const middle = makeWrapper(document, {
					preset: 'fade',
					trigger: 'hover',
					animationMode,
					exitMode,
					hideUntilHover: animationMode !== 'out',
					html: '<p>Copy</p>',
				});
				outer.appendChild(middle);
				document.body.appendChild(outer);
				assert.doesNotThrow(() => {
					abw.setupWrapper(outer);
					abw.setupWrapper(middle);
				});
				assert.equal(typeof outer.abwReplay, 'function');
				assert.equal(typeof middle.abwReplay, 'function');
			});
		}
	}

	for (const followParentAnimation of follows) {
		for (const inheritParentDelay of inherits) {
			it(`setup survives follow=${followParentAnimation} inherit=${inheritParentDelay}`, () => {
				const { document, abw } = createRuntime();
				const { rise, hover, scrub } = buildThreeLevelStack(document, {
					middle: { inheritParentDelay, delay: 300 },
					scrub: {
						followParentAnimation,
						preset: followParentAnimation ? 'fade' : 'scroll-media',
						trigger: followParentAnimation ? 'scroll' : 'scroll-media',
					},
				});
				document.body.appendChild(rise);
				assert.doesNotThrow(() => {
					abw.setupWrapper(rise);
					abw.setupWrapper(hover);
					abw.setupWrapper(scrub);
				});
			});
		}
	}

	it('initAnimationWrappers boots a mixed nested page without throwing', () => {
		const { document, abw, window } = createRuntime();
		const { rise, hover, scrub } = buildThreeLevelStack(document);
		const clicky = makeWrapper(document, {
			preset: 'zoom',
			trigger: 'click',
			animationMode: 'both',
			html: '<p>Click</p>',
		});
		const loadWrap = makeWrapper(document, {
			preset: 'blur-in',
			trigger: 'load',
			html: '<p>Load</p>',
		});
		document.body.append(rise, clicky, loadWrap);
		assert.doesNotThrow(() => abw.initAnimationWrappers());
		assert.equal(typeof rise.abwReplay, 'function');
		assert.equal(typeof hover.abwReplay, 'function');
		assert.equal(typeof clicky.abwReplay, 'function');
		assert.equal(typeof loadWrap.abwReplay, 'function');
		// scrub-media returns early without abwReplay
		assert.equal(typeof scrub.abwReplay, 'undefined');

		clicky.dispatchEvent(new window.Event('click', { bubbles: true }));
		assert.ok((clicky.abwAnimations || []).length > 0);
	});

	it('legacy hover without animationMode still behaves as both under a parent', async () => {
		const { document, abw, window } = createRuntime();
		const outer = makeWrapper(document, { trigger: 'scroll', html: '' });
		const hover = makeWrapper(document, {
			trigger: 'hover',
			delay: 0,
			duration: 20,
			html: '<p>Legacy</p>',
		});
		delete hover.dataset.ffawAnimationMode;
		outer.appendChild(hover);
		document.body.appendChild(outer);
		abw.setupWrapper(hover);
		assert.equal(abw.resolveAnimationMode(hover), 'both');

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		await Promise.all(
			(hover.abwAnimations || []).map((animation) => animation.finished.catch(() => undefined))
		);
		await new Promise((resolve) => setTimeout(resolve, 25));
		assert.equal(abw.hasEntranceFullyCompleted(hover), true);

		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
		assert.ok((hover.abwAnimations || []).length > 0);
	});
});

describe('enforceInitialInvisibleState with nesting', () => {
	it('primes nested-only outer shell without touching deep leaf copy styles via wrong target', () => {
		const { document, abw } = createRuntime();
		const { rise, hover, copy } = buildThreeLevelStack(document);
		document.body.appendChild(rise);
		abw.enforceInitialInvisibleState(rise);

		// Outer primes the middle shell.
		assert.ok(hover.style.opacity === '0' || hover.getAttribute('style')?.includes('opacity'));
		// Deep copy should not be a direct outer target.
		const outerTargets = tagTargets(abw.getAnimationTargets(rise, 'text-rise', 'word'));
		assert.ok(!outerTargets.includes(copy));
	});

	it('middle priming hides copy but not independent scrub children via CSS class path', () => {
		const { document, abw } = createRuntime();
		const { rise, hover, copy, scrub } = buildThreeLevelStack(document);
		document.body.appendChild(rise);
		abw.setupWrapper(hover);
		assert.equal(isHidden(document, copy), true);
		assert.equal(isHidden(document, scrub), false);
	});
});
