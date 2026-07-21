import type { Direction, NormalizedAnimationPreset, TextGranularity, ZoomMode } from './types.js';

export type AnimationFrame = Keyframe & { offset?: number };

const PRESET_KEYFRAMES: Record<string, AnimationFrame[]> = {
	'blur-in': [
		// Opacity + rise only. Animating `filter: blur()` via WAAPI leaves a stuck
		// composited blur layer on mobile Safari after cancel/finish — common on list rows.
		{ opacity: 0, transform: 'translate3d(0, 14px, 0)' },
		{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
	],
	'text-rise': [
		{ opacity: 0, transform: 'translate3d(0, 14px, 0)' },
		{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
	],
	'word-cascade': [
		{ opacity: 0, transform: 'translate3d(0, 10px, 0)' },
		{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
	],
	'letter-pop': [
		{ opacity: 0, transform: 'scale(0.88) translate3d(0, 6px, 0)' },
		{ opacity: 1, transform: 'scale(1) translate3d(0, 0, 0)' },
	],
	'pulse-soft': [
		{ transform: 'scale(1)', opacity: 1, offset: 0 },
		{ transform: 'scale(1.03)', opacity: 0.92, offset: 0.22 },
		{ transform: 'scale(1)', opacity: 1, offset: 1 },
	],
	'bounce-soft': [
		{ transform: 'translate3d(0, 0, 0)', offset: 0 },
		{ transform: 'translate3d(0, -14px, 0)', offset: 0.2 },
		{ transform: 'translate3d(0, 0, 0)', offset: 1 },
	],
};

export function resolvePresetKeyframes(
	preset: NormalizedAnimationPreset,
	direction: Direction,
	zoomMode: ZoomMode,
	textGranularity: TextGranularity
): AnimationFrame[] {
	if (preset === 'fade') {
		if (direction === 'down') {
			return [
				{ opacity: 0, transform: 'translate3d(0, -18px, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		if (direction === 'left') {
			return [
				{ opacity: 0, transform: 'translate3d(18px, 0, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		if (direction === 'right') {
			return [
				{ opacity: 0, transform: 'translate3d(-18px, 0, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		return [
			{ opacity: 0, transform: 'translate3d(0, 18px, 0)' },
			{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
		];
	}

	if (preset === 'slide') {
		if (direction === 'down') {
			return [
				{ opacity: 0, transform: 'translate3d(0, -36px, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		if (direction === 'left') {
			return [
				{ opacity: 0, transform: 'translate3d(24px, 0, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		if (direction === 'right') {
			return [
				{ opacity: 0, transform: 'translate3d(-24px, 0, 0)' },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			];
		}
		return [
			{ opacity: 0, transform: 'translate3d(0, 36px, 0)' },
			{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
		];
	}

	if (preset === 'text-rise') {
		return direction === 'down'
			? [
					{ opacity: 0, transform: 'translate3d(0, -14px, 0)' },
					{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
			  ]
			: PRESET_KEYFRAMES['text-rise'];
	}

	if (preset === 'zoom') {
		return zoomMode === 'out'
			? [
					{ opacity: 0, transform: 'scale(1.08)' },
					{ opacity: 1, transform: 'scale(1)' },
			  ]
			: [
					{ opacity: 0, transform: 'scale(0.92)' },
					{ opacity: 1, transform: 'scale(1)' },
			  ];
	}

	if (preset === 'rotate-in') {
		const start = direction === 'counterclockwise' ? 6 : -6;
		return [
			{ opacity: 0, transform: `rotate(${start}deg) scale(0.98)` },
			{ opacity: 1, transform: 'rotate(0deg) scale(1)' },
		];
	}

	if (preset === 'flip') {
		const axis = direction === 'horizontal' ? 'X' : 'Y';
		const angle = direction === 'right' ? 18 : -18;
		return [
			{ opacity: 0, transform: `perspective(600px) rotate${axis}(${angle}deg)` },
			{ opacity: 1, transform: `perspective(600px) rotate${axis}(0deg)` },
		];
	}

	if (preset === 'float-soft') {
		if (direction === 'down') {
			return [
				{ transform: 'translate3d(0, 0, 0)', offset: 0 },
				{ transform: 'translate3d(0, 8px, 0)', offset: 0.2 },
				{ transform: 'translate3d(0, 0, 0)', offset: 1 },
			];
		}
		if (direction === 'left') {
			return [
				{ transform: 'translate3d(0, 0, 0)', offset: 0 },
				{ transform: 'translate3d(-8px, 0, 0)', offset: 0.2 },
				{ transform: 'translate3d(0, 0, 0)', offset: 1 },
			];
		}
		if (direction === 'right') {
			return [
				{ transform: 'translate3d(0, 0, 0)', offset: 0 },
				{ transform: 'translate3d(8px, 0, 0)', offset: 0.2 },
				{ transform: 'translate3d(0, 0, 0)', offset: 1 },
			];
		}
		return [
			{ transform: 'translate3d(0, 0, 0)', offset: 0 },
			{ transform: 'translate3d(0, -8px, 0)', offset: 0.2 },
			{ transform: 'translate3d(0, 0, 0)', offset: 1 },
		];
	}

	if (preset === 'pulse-soft' && textGranularity === 'character') {
		return [
			{ transform: 'scale(1) translate3d(0, 0, 0)', opacity: 1, offset: 0 },
			{ transform: 'scale(1.12) translate3d(0, -2px, 0)', opacity: 0.78, offset: 0.2 },
			{ transform: 'scale(1) translate3d(0, 0, 0)', opacity: 1, offset: 1 },
		];
	}

	return PRESET_KEYFRAMES[preset] || [
		{ opacity: 0, transform: 'translate3d(0, 18px, 0)' },
		{ opacity: 1, transform: 'translate3d(0, 0, 0)' },
	];
}
