import type { AnimationOptions, ResponsiveAnimationOverride } from './types.js';

export function applyOptionsAt(
	base: AnimationOptions,
	overrides: ResponsiveAnimationOverride[] = []
): AnimationOptions {
	if (!overrides.length) {
		return base;
	}
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return base;
	}

	for (const entry of overrides) {
		if (!entry.query) {
			continue;
		}
		try {
			if (window.matchMedia(entry.query).matches) {
				const { query: _query, ...patch } = entry;
				return { ...base, ...patch, optionsAt: overrides };
			}
		} catch {
			// Ignore invalid media queries.
		}
	}

	return base;
}

export function subscribeOptionsAt(
	overrides: ResponsiveAnimationOverride[],
	onChange: () => void
): () => void {
	if (!overrides.length || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {};
	}

	const subscriptions = overrides
		.filter((entry) => entry.query)
		.map((entry) => {
			const mediaQueryList = window.matchMedia(entry.query);
			const handler = () => onChange();
			mediaQueryList.addEventListener('change', handler);
			return { mediaQueryList, handler };
		});

	return () => {
		subscriptions.forEach(({ mediaQueryList, handler }) => {
			mediaQueryList.removeEventListener('change', handler);
		});
	};
}

export function parseOptionsAtAttribute(value?: string): ResponsiveAnimationOverride[] {
	if (!value) {
		return [];
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed as ResponsiveAnimationOverride[] : [];
	} catch {
		return [];
	}
}
