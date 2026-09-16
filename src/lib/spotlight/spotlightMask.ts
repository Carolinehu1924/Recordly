import {
	type AnnotationRegion,
	DEFAULT_SPOTLIGHT_OPACITY,
	MAX_SPOTLIGHT_OPACITY,
	MIN_SPOTLIGHT_OPACITY,
} from "@/components/video-editor/types";

/** Duration of the spotlight fade in and fade out, in milliseconds. */
export const SPOTLIGHT_FADE_MS = 300;
/** Corner radius of a spotlight hole, in base preview pixels (1920px wide). */
export const SPOTLIGHT_CORNER_RADIUS = 12;

export interface SpotlightRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SpotlightMaskPaintOptions {
	/** Area that gets dimmed, usually the video rect in canvas coordinates. */
	area: SpotlightRect;
	/** Corner radius of the dimmed area so it follows the video's rounded corners. */
	areaRadius: number;
	/** Areas kept at full brightness. Overlapping holes merge instead of stacking. */
	holes: SpotlightRect[];
	holeRadius: number;
	/** Dimming alpha between 0 and 1. */
	alpha: number;
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Fade multiplier (0-1) for a region at the given time, including fade in and out. */
export function getSpotlightFadeFactor(
	region: Pick<AnnotationRegion, "startMs" | "endMs">,
	timeMs: number,
): number {
	const { startMs, endMs } = region;
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
	if (timeMs < startMs || timeMs > endMs) return 0;

	const fadeMs = Math.min(SPOTLIGHT_FADE_MS, (endMs - startMs) / 2);
	if (fadeMs <= 0) return 1;

	return clamp01(Math.min((timeMs - startMs) / fadeMs, (endMs - timeMs) / fadeMs, 1));
}

/** Spotlight regions that should be painted at the given time. Disabled ones are skipped. */
export function getActiveSpotlights(
	annotations: readonly AnnotationRegion[],
	timeMs: number,
): AnnotationRegion[] {
	return annotations.filter(
		(annotation) =>
			annotation.type === "spotlight" &&
			!annotation.disabled &&
			timeMs >= annotation.startMs &&
			timeMs <= annotation.endMs,
	);
}

/** Dimming alpha for overlapping spotlights: the strongest active spotlight wins. */
export function getSpotlightDimAlpha(
	spotlights: readonly AnnotationRegion[],
	timeMs: number,
): number {
	let alpha = 0;
	for (const spotlight of spotlights) {
		const opacity = Math.min(
			MAX_SPOTLIGHT_OPACITY,
			Math.max(
				MIN_SPOTLIGHT_OPACITY,
				spotlight.spotlightOpacity ?? DEFAULT_SPOTLIGHT_OPACITY,
			),
		);
		alpha = Math.max(alpha, (opacity / 100) * getSpotlightFadeFactor(spotlight, timeMs));
	}
	return clamp01(alpha);
}

function clampRadius(rect: SpotlightRect, radius: number): number {
	return Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
}

/**
 * Paint a dim layer with transparent holes. The target context must be a dedicated
 * layer (not the video canvas), because holes are cut with destination-out.
 */
export function paintSpotlightMask(
	ctx: CanvasRenderingContext2D,
	{ area, areaRadius, holes, holeRadius, alpha }: SpotlightMaskPaintOptions,
): boolean {
	const safeAlpha = clamp01(alpha);
	const validHoles = holes.filter((hole) => hole.width > 0 && hole.height > 0);
	if (safeAlpha <= 0 || validHoles.length === 0 || area.width <= 0 || area.height <= 0) {
		return false;
	}

	ctx.save();
	ctx.fillStyle = `rgba(0, 0, 0, ${safeAlpha})`;
	ctx.beginPath();
	ctx.roundRect(area.x, area.y, area.width, area.height, clampRadius(area, areaRadius));
	ctx.fill();

	ctx.globalCompositeOperation = "destination-out";
	ctx.fillStyle = "#000";
	ctx.beginPath();
	for (const hole of validHoles) {
		ctx.roundRect(hole.x, hole.y, hole.width, hole.height, clampRadius(hole, holeRadius));
	}
	ctx.fill();
	ctx.restore();
	return true;
}
