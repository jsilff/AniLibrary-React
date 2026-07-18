import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, makeWrapper, stubInViewport } from './helpers/loadRuntime.mjs';

describe('entrance completion gating for exits', () => {
	it('does not treat delayed entrance as visually started', () => {
		const { document, abw, window } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			delay: 1000,
			duration: 400,
			html: '<p>Hi</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));

		assert.equal(abw.hasEntranceVisuallyStarted(hover), false);
		assert.equal(abw.hasEntranceFullyCompleted(hover), false);
	});

	it('marks entrance completed after animations finish', async () => {
		const { document, abw, window } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			delay: 0,
			duration: 20,
			html: '<p>Hi</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));

		assert.equal(abw.hasEntranceVisuallyStarted(hover), true);
		await Promise.all(
			(hover.abwAnimations || []).map((animation) => animation.finished.catch(() => undefined))
		);
		// Allow the runtime completion hook to settle.
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(abw.hasEntranceFullyCompleted(hover), true);
	});

	it('queues exit until entrance finishes when leaving mid-flight', async () => {
		const { document, abw, window } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			delay: 0,
			duration: 40,
			html: '<p>Hi</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));

		const entrance = [...(hover.abwAnimations || [])];
		assert.ok(entrance.length);

		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
		assert.equal(hover.abwExitQueued, true);
		// Entrance must not have been canceled by an immediate exit.
		assert.ok(entrance.every((animation) => animation.playState === 'running' || animation.playState === 'finished'));

		await Promise.all(entrance.map((animation) => animation.finished.catch(() => undefined)));
		await new Promise((resolve) => setTimeout(resolve, 40));

		assert.equal(hover.abwExitQueued, false);
		assert.ok((hover.abwAnimations || []).length >= 1);
	});

	it('re-entering mid-exit does not re-apply hide-until-hover while armed', async () => {
		const { document, abw, window } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			hideUntilHover: true,
			delay: 0,
			duration: 40,
			html: '<p>Hi</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		await Promise.all(
			(hover.abwAnimations || []).map((animation) => animation.finished.catch(() => undefined))
		);
		await new Promise((resolve) => setTimeout(resolve, 20));

		hover.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
		const exitAnimations = [...(hover.abwAnimations || [])];
		assert.ok(exitAnimations.length);

		hover.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 50));

		assert.ok(hover.classList.contains('abw-hover-armed'));
		assert.ok(!hover.classList.contains('abw-hide-until-hover'));
	});
});

describe('hide until hover priming', () => {
	it('does not prime hide class when Hide until hover is off', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			hideUntilHover: false,
			html: '<p>Visible</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		assert.ok(!hover.classList.contains('abw-hide-until-hover'));
	});

	it('primes hide class when Hide until hover is on', () => {
		const { document, abw } = createRuntime();
		const hover = makeWrapper(document, {
			preset: 'fade',
			trigger: 'hover',
			animationMode: 'both',
			hideUntilHover: true,
			html: '<p>Hidden</p>',
		});
		document.body.appendChild(hover);
		abw.setupWrapper(hover);
		assert.ok(hover.classList.contains('abw-hide-until-hover'));
	});
});

describe('animation mode legacy vs explicit in', () => {
	it('infers both for legacy scroll replay without mode attribute', () => {
		const { document, abw } = createRuntime();
		const wrap = makeWrapper(document, {
			trigger: 'scroll',
			once: false,
		});
		delete wrap.dataset.ffawAnimationMode;
		assert.equal(abw.resolveAnimationMode(wrap), 'both');
	});

	it('keeps explicit in for scroll replay when mode is serialized', () => {
		const { document, abw } = createRuntime();
		const wrap = makeWrapper(document, {
			trigger: 'scroll',
			once: false,
			animationMode: 'in',
		});
		assert.equal(abw.resolveAnimationMode(wrap), 'in');
	});
});

describe('scroll out-only observer retention', () => {
	it('keeps observing after above-the-fold manual entry so exit can fire', async () => {
		const { document, abw, window } = createRuntime();
		const wrap = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			animationMode: 'out',
			once: true,
			html: '<p>Out only</p>',
		});
		stubInViewport(wrap);
		document.body.appendChild(wrap);
		abw.setupWrapper(wrap);

		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(wrap.abwEntranceCompleted, true);
		assert.equal(window.__ABW_OBSERVERS__.length, 1);
		assert.ok(window.__ABW_OBSERVERS__[0].elements.has(wrap));
	});

	it('unobserves in-only once wrappers after manual entry', async () => {
		const { document, abw, window } = createRuntime();
		const wrap = makeWrapper(document, {
			preset: 'fade',
			trigger: 'scroll',
			animationMode: 'in',
			once: true,
			delay: 0,
			duration: 10,
			html: '<p>In only</p>',
		});
		stubInViewport(wrap);
		document.body.appendChild(wrap);
		abw.setupWrapper(wrap);

		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(window.__ABW_OBSERVERS__.length, 1);
		assert.ok(!window.__ABW_OBSERVERS__[0].elements.has(wrap));
	});
});

describe('click and scroll mode wiring', () => {
	it('click in-only plays entrance without requiring toggle', () => {
		const { document, abw, window } = createRuntime();
		const wrap = makeWrapper(document, {
			preset: 'fade',
			trigger: 'click',
			animationMode: 'in',
			delay: 0,
			duration: 20,
			html: '<p>Click me</p>',
		});
		document.body.appendChild(wrap);
		abw.setupWrapper(wrap);
		wrap.dispatchEvent(new window.Event('click', { bubbles: true }));
		assert.ok((wrap.abwAnimations || []).length > 0);
	});

	it('click both toggles entrance then exit', async () => {
		const { document, abw, window } = createRuntime();
		const wrap = makeWrapper(document, {
			preset: 'fade',
			trigger: 'click',
			animationMode: 'both',
			delay: 0,
			duration: 15,
			html: '<p>Toggle</p>',
		});
		document.body.appendChild(wrap);
		abw.setupWrapper(wrap);

		wrap.dispatchEvent(new window.Event('click', { bubbles: true }));
		await Promise.all((wrap.abwAnimations || []).map((a) => a.finished.catch(() => undefined)));
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(wrap.abwEntranceCompleted, true);

		wrap.dispatchEvent(new window.Event('click', { bubbles: true }));
		assert.ok((wrap.abwAnimations || []).length > 0);
	});
});

describe('preset / intensity sanity', () => {
	it('keyframesStartHidden detects entrance presets and not soft loops', () => {
		const { abw } = createRuntime();
		const fade = abw.resolvePresetKeyframes('fade', 'up', 'in', 'word');
		const pulse = abw.resolvePresetKeyframes('pulse-soft', 'up', 'in', 'word');
		assert.equal(abw.keyframesStartHidden(fade), true);
		assert.equal(abw.keyframesStartHidden(pulse), false);
	});

	it('intensity scales transform deltas', () => {
		const { abw } = createRuntime();
		const base = abw.resolvePresetKeyframes('fade', 'up', 'in', 'word');
		const strong = abw.applyIntensityToKeyframes(base, 200);
		assert.match(String(strong[0].transform), /translate3d/);
		assert.notEqual(strong[0].transform, base[0].transform);
	});
});
