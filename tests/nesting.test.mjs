import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, makeWrapper, computedOpacity } from './helpers/loadRuntime.mjs';

function ids(nodes) {
	return Array.from(nodes, (node) => String(node.dataset.testId || node.tagName.toLowerCase()));
}

function isEffectivelyHidden(document, element) {
	const opacity = computedOpacity(document, element);
	return opacity === '0';
}

function isEffectivelyVisible(document, element) {
	return !isEffectivelyHidden(document, element);
}

describe('nested animation targets', () => {
	it('outer Rise with only a nested Hover child falls back to animating that shell', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'text-rise',
			trigger: 'scroll',
			html: '',
		});
		const middle = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			html: '<p data-test-id="copy">Copy</p>',
		});
		middle.dataset.testId = 'middle';
		outer.appendChild(middle);

		const targets = abw.getAnimationTargets(outer, 'text-rise', 'word');
		assert.equal(targets.length, 1);
		assert.equal(targets[0], middle);
	});

	it('outer prefers joining nested children when they opt in, and still keeps plain siblings', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			html: '',
		});
		const plain = document.createElement('p');
		plain.dataset.testId = 'plain';
		plain.textContent = 'Hello';
		const joining = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			followParentAnimation: true,
			html: '<p>Nested</p>',
		});
		joining.dataset.testId = 'joining';
		const independent = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: false,
			html: '<video></video>',
		});
		independent.dataset.testId = 'independent';
		outer.append(plain, joining, independent);

		const targets = abw.getAnimationTargets(outer, 'fade', 'word');
		assert.deepEqual(ids(targets), ['plain', 'joining']);
		assert.ok(!targets.includes(independent));
	});

	it('hover parent text targets include joining Scrub but exclude independent Scrub', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			contentKind: 'mixed',
			html: '',
		});
		const copy = document.createElement('p');
		copy.dataset.testId = 'copy';
		copy.textContent = 'Platform';
		const scrubJoin = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: true,
			html: '<video data-test-id="vid"></video>',
		});
		scrubJoin.dataset.testId = 'scrub-join';
		hover.append(copy, scrubJoin);

		const withJoin = abw.getAnimationTargets(hover, 'fade', 'word');
		assert.ok(withJoin.includes(copy));
		assert.ok(withJoin.includes(scrubJoin));

		scrubJoin.dataset.ffawFollowParentAnimation = '0';
		const withoutJoin = abw.getAnimationTargets(hover, 'fade', 'word');
		assert.ok(withoutJoin.includes(copy));
		assert.ok(!withoutJoin.includes(scrubJoin));
	});

	it('skips mixed blocks that contain nested wrappers unless fallback is needed', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			html: '',
		});
		const mixed = document.createElement('div');
		mixed.dataset.testId = 'mixed';
		const nested = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			html: '<p>Inside</p>',
		});
		mixed.appendChild(nested);
		outer.appendChild(mixed);

		const targets = abw.getAnimationTargets(outer, 'fade', 'word');
		// preferred empty → fallback to direct children (the mixed shell)
		assert.equal(targets.length, 1);
		assert.equal(targets[0], mixed);
	});

	it('three-level stack: outer targets middle shell; middle can independently target copy + joining scrub', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'text-rise',
			trigger: 'scroll',
			delay: 1900,
			html: '',
		});
		const middle = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			delay: 2400,
			hideUntilHover: true,
			html: '',
		});
		middle.dataset.testId = 'middle';
		const copy = document.createElement('p');
		copy.dataset.testId = 'copy';
		copy.textContent = 'Unified Intelligence';
		const scrub = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: false,
			html: '<video></video>',
		});
		scrub.dataset.testId = 'scrub';
		middle.append(copy, scrub);
		outer.appendChild(middle);

		const outerTargets = abw.getAnimationTargets(outer, 'text-rise', 'word');
		assert.deepEqual(ids(outerTargets), ['middle']);

		const middleTargetsIndependent = abw.getAnimationTargets(middle, 'fade', 'word');
		assert.ok(middleTargetsIndependent.includes(copy));
		assert.ok(!middleTargetsIndependent.includes(scrub));

		scrub.dataset.ffawFollowParentAnimation = '1';
		const middleTargetsJoined = abw.getAnimationTargets(middle, 'fade', 'word');
		assert.ok(middleTargetsJoined.includes(copy));
		assert.ok(middleTargetsJoined.includes(scrub));
	});
});

describe('hide-until-hover nesting visibility', () => {
	it('hides plain children and joining wrappers, but not independent nested wrappers', () => {
		const { document } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			hideUntilHover: true,
			html: '',
		});
		hover.classList.add('abw-hide-until-hover');
		const copy = document.createElement('p');
		copy.textContent = 'Copy';
		const joining = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: true,
			html: '<video></video>',
		});
		const independent = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: false,
			html: '<video></video>',
		});
		hover.append(copy, joining, independent);
		document.body.appendChild(hover);

		assert.equal(isEffectivelyHidden(document, copy), true);
		assert.equal(isEffectivelyHidden(document, joining), true);
		assert.equal(isEffectivelyVisible(document, independent), true);
	});

	it('data-ffaw-hide-until-hover pre-JS rule matches class behavior for nested wrappers', () => {
		const { document } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			hideUntilHover: true,
			html: '',
		});
		// class not added yet — data attribute rule should still hide
		const copy = document.createElement('p');
		copy.textContent = 'Copy';
		const independent = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			html: '<video></video>',
		});
		hover.append(copy, independent);
		document.body.appendChild(hover);

		assert.equal(isEffectivelyHidden(document, copy), true);
		assert.equal(isEffectivelyVisible(document, independent), true);
	});
});

describe('inherit parent delay', () => {
	it('adds parent delay only when inherit flag is set', () => {
		const { document, abw } = createRuntime();
		const parent = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			delay: 1900,
			html: '',
		});
		const child = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			delay: 500,
			inheritParentDelay: false,
			html: '<p>Child</p>',
		});
		parent.appendChild(child);
		document.body.appendChild(parent);

		assert.equal(abw.resolveInheritedDelay(child, 500), 500);

		child.dataset.ffawInheritParentDelay = '1';
		assert.equal(abw.resolveInheritedDelay(child, 500), 2400);
	});

	it('stacks through multiple ancestors when each inherits', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, { delay: 1000, html: '' });
		const middle = makeWrapper(document, {
			delay: 400,
			inheritParentDelay: true,
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

		assert.equal(abw.resolveInheritedDelay(inner, 200), 1600);
	});
});

describe('animation mode resolution', () => {
	it('defaults to in, honors explicit modes, and infers legacy both cases', () => {
		const { document, abw } = createRuntime();
		const fresh = makeWrapper(document, { trigger: 'scroll' });
		assert.equal(abw.resolveAnimationMode(fresh), 'in');

		const both = makeWrapper(document, { animationMode: 'both' });
		assert.equal(abw.resolveAnimationMode(both), 'both');

		const out = makeWrapper(document, { animationMode: 'out' });
		assert.equal(abw.resolveAnimationMode(out), 'out');

		const legacyHover = makeWrapper(document, { trigger: 'hover' });
		delete legacyHover.dataset.ffawAnimationMode;
		assert.equal(abw.resolveAnimationMode(legacyHover), 'both');

		const legacyScrollReplay = makeWrapper(document, { trigger: 'scroll', once: false });
		delete legacyScrollReplay.dataset.ffawAnimationMode;
		assert.equal(abw.resolveAnimationMode(legacyScrollReplay), 'both');
	});

	it('once defaults to true when attribute missing', () => {
		const { document, abw } = createRuntime();
		const el = makeWrapper(document, {});
		delete el.dataset.ffawOnce;
		assert.equal(abw.resolveOnceOption(el), true);
		el.dataset.ffawOnce = '0';
		assert.equal(abw.resolveOnceOption(el), false);
	});
});

describe('exit keyframe derivation', () => {
	it('rewind reverses entrance; continue flips travel direction', () => {
		const { abw } = createRuntime();
		const entry = abw.resolvePresetKeyframes('fade', 'up', 'in', 'word');
		const rewind = abw.deriveExitKeyframes(entry, 'rewind');
		const cont = abw.deriveExitKeyframes(entry, 'continue');

		assert.equal(rewind[0].opacity, 1);
		assert.equal(rewind[1].opacity, 0);
		assert.match(rewind[1].transform, /translate3d\(0,\s*18px/);

		assert.equal(cont[0].opacity, 1);
		assert.equal(cont[1].opacity, 0);
		assert.match(cont[1].transform, /translate3d\(0,\s*-18px/);
	});
});

describe('runtime setup nesting behaviors', () => {
	it('sets up outer scroll + middle hover + independent scrub without throwing', () => {
		const { document, abw } = createRuntime();
		const outer = makeWrapper(document, {
			preset: 'text-rise',
			trigger: 'scroll',
			animationMode: 'in',
			delay: 1900,
			html: '',
		});
		const middle = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			exitMode: 'continue',
			delay: 500,
			hideUntilHover: true,
			html: '',
		});
		const copy = document.createElement('p');
		copy.textContent = 'Headline';
		const scrub = makeWrapper(document, {
			preset: 'scroll-media',
			trigger: 'scroll-media',
			followParentAnimation: false,
			html: '<div class="scrub"></div>',
		});
		middle.append(copy, scrub);
		outer.appendChild(middle);
		document.body.appendChild(outer);

		assert.doesNotThrow(() => {
			abw.setupWrapper(outer);
			abw.setupWrapper(middle);
			// scrub-media may early-return without media; should not throw
			abw.setupWrapper(scrub);
		});

		assert.equal(typeof outer.abwReplay, 'function');
		assert.equal(typeof middle.abwReplay, 'function');
		assert.ok(middle.classList.contains('abw-hide-until-hover'));
		assert.equal(isEffectivelyHidden(document, copy), true);
		assert.equal(isEffectivelyVisible(document, scrub), true);
	});

	it('joining scrub is hidden with hover parent until armed', () => {
		const { document, abw } = createRuntime();
		const middle = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			hideUntilHover: true,
			html: '',
		});
		const copy = document.createElement('p');
		copy.textContent = 'Headline';
		const scrub = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			followParentAnimation: true,
			html: '<div class="scrub"></div>',
		});
		middle.append(copy, scrub);
		document.body.appendChild(middle);
		abw.setupWrapper(middle);

		assert.equal(isEffectivelyHidden(document, copy), true);
		assert.equal(isEffectivelyHidden(document, scrub), true);
	});

	it('hover leave before delay skips exit and restores idle hide state', async () => {
		const { document, abw, window } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			hideUntilHover: true,
			delay: 5000,
			duration: 700,
			html: '<p>Hello</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		assert.ok(hover.classList.contains('abw-hover-armed'));

		// Still in delay window — exit should be skipped.
		assert.equal(abw.hasEntranceVisuallyStarted(hover), false);
		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));

		assert.equal(abw.hasEntranceVisuallyStarted(hover), false);
		assert.ok(hover.classList.contains('abw-hide-until-hover'));
		assert.ok(!hover.classList.contains('abw-hover-armed'));
	});
});
