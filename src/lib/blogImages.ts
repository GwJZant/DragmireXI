import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<ImageMetadata>('../assets/blog/*', {
	eager: true,
	import: 'default',
});

function fileNameFromPath(path: string): string {
	return path.split('/').pop() ?? path;
}

/** All images in `src/assets/blog/`, keyed by filename (e.g. `Dreamer_1.png`). */
export const blogImages: Record<string, ImageMetadata> = Object.fromEntries(
	Object.entries(modules).map(([path, meta]) => [fileNameFromPath(path), meta]),
);

export function blogImageSrc(filename: string): string {
	const meta = blogImages[filename];
	if (!meta) {
		const known = Object.keys(blogImages).join(', ') || '(none)';
		throw new Error(`Blog image "${filename}" not found. Known files: ${known}`);
	}
	return meta.src;
}
