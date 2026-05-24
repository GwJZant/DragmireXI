import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<ImageMetadata>(
	'../assets/blog/**/*.{png,jpg,jpeg,gif,webp,avif,svg}',
	{
		eager: true,
		import: 'default',
	},
);

/** Path segment after `assets/blog/` (forward slashes), e.g. `Dreamer_1.png` or `tabun/diagram.png`. */
function blogKeyFromImportPath(importPath: string): string {
	const n = importPath.replace(/\\/g, '/');
	const mark = 'assets/blog/';
	const i = n.indexOf(mark);
	if (i === -1) {
		throw new Error(`Unexpected blog image import path (missing assets/blog/): ${importPath}`);
	}
	return n.slice(i + mark.length);
}

/**
 * Normalizes a markdown image `src` to the key used in `blogImages`.
 * Accepts e.g. `Dreamer_1.png`, `tabun/chart.png`, `./tabun/chart.png`.
 * Rejects `..` segments.
 */
export function normalizeBlogImageRef(ref: string): string {
	let s = ref.trim().replace(/\\/g, '/');
	while (s.startsWith('./')) s = s.slice(2);
	while (s.startsWith('/')) s = s.slice(1);
	if (s === '' || s.split('/').some((p) => p === '..')) {
		throw new Error(`Invalid blog image path: ${ref}`);
	}
	return s;
}

/** All images under `src/assets/blog/`, keyed by path relative to that folder (nested paths allowed). */
export const blogImages: Record<string, ImageMetadata> = Object.fromEntries(
	Object.entries(modules).map(([importPath, meta]) => [blogKeyFromImportPath(importPath), meta]),
);

export function blogImageSrc(ref: string): string {
	const key = normalizeBlogImageRef(ref);
	const meta = blogImages[key];
	if (!meta) {
		const known = Object.keys(blogImages).sort().join(', ') || '(none)';
		throw new Error(`Blog image "${key}" not found. Known paths: ${known}`);
	}
	return meta.src;
}
