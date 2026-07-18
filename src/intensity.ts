import type { AnimationFrame } from './keyframes.js';

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function parseNumericToken(token: string): { value: number; unit: string } | null {
	const match = String(token).trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
	if (!match) {
		return null;
	}
	return {
		value: Number(match[1]),
		unit: match[2] || '',
	};
}

function scaleLinearToken(token: string, factor: number): string {
	const parsed = parseNumericToken(token);
	if (!parsed) {
		return token;
	}
	return `${parsed.value * factor}${parsed.unit}`;
}

function scaleScaleToken(token: string, factor: number): string {
	const parsed = parseNumericToken(token);
	if (!parsed) {
		return token;
	}
	return `${1 + (parsed.value - 1) * factor}${parsed.unit}`;
}

function scaleTransformIntensity(transform: string, factor: number): string {
	return String(transform)
		.replace(/translate3d\(([^,]+),([^,]+),([^)]+)\)/g, (_match, x, y, z) =>
			`translate3d(${scaleLinearToken(x, factor)}, ${scaleLinearToken(y, factor)}, ${scaleLinearToken(z, factor)})`
		)
		.replace(/translateX\(([^)]+)\)/g, (_match, x) => `translateX(${scaleLinearToken(x, factor)})`)
		.replace(/translateY\(([^)]+)\)/g, (_match, y) => `translateY(${scaleLinearToken(y, factor)})`)
		.replace(/translateZ\(([^)]+)\)/g, (_match, z) => `translateZ(${scaleLinearToken(z, factor)})`)
		.replace(/scale\(([^)]+)\)/g, (_match, scale) => `scale(${scaleScaleToken(scale, factor)})`)
		.replace(/rotate(?:X|Y|Z)?\(([^)]+)\)/g, (match, value) => {
			const fn = match.slice(0, match.indexOf('('));
			return `${fn}(${scaleLinearToken(value, factor)})`;
		});
}

function scaleFilterIntensity(filter: string, factor: number): string {
	return String(filter).replace(/blur\(([-\d.]+)px\)/g, (_match, value) => {
		return `blur(${Number(value) * factor}px)`;
	});
}

function scaleOpacityIntensity(opacity: string | number, factor: number): string | number {
	const numeric = Number(opacity);
	if (Number.isNaN(numeric)) {
		return opacity;
	}
	return clamp(1 - (1 - numeric) * factor, 0, 1);
}

export function applyIntensityToKeyframes(keyframes: AnimationFrame[], intensityPercent: number): AnimationFrame[] {
	const factor = clamp((Number(intensityPercent || 100) / 100) * 1.5, 0.15, 3);
	return keyframes.map((frame) => {
		const nextFrame = { ...frame };
		if (typeof nextFrame.transform === 'string') {
			nextFrame.transform = scaleTransformIntensity(nextFrame.transform, factor);
		}
		if (typeof nextFrame.filter === 'string') {
			nextFrame.filter = scaleFilterIntensity(nextFrame.filter, factor);
		}
		if (nextFrame.opacity !== undefined && nextFrame.opacity !== null) {
			nextFrame.opacity = scaleOpacityIntensity(nextFrame.opacity, factor);
		}
		return nextFrame;
	});
}
