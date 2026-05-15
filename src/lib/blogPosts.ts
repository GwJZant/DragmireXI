import { blogImages, blogImageSrc } from './blogImages';

export type TextBlock = {
	type: 'text';
	content: string;
	/** When true, render as a section header instead of body text. Defaults to false. */
	header?: boolean;
};

/** `file` is a filename in `src/assets/blog/` (key on `blogImages`). */
export type ImageBlock = {
	type: 'image';
	file: string;
	alt?: string;
	caption?: string;
};

/** Two or more images laid out side-by-side in a single horizontal row. */
export type ImageRowBlock = {
	type: 'imageRow';
	images: { file: string; alt?: string; caption?: string }[];
};

export type PostBlock = TextBlock | ImageBlock | ImageRowBlock;

export type TheoryPost = {
	/** URL-safe identifier used as the post's page path: /blog/[slug]. Comes from the markdown filename. */
	slug: string;
	title: string;
	subtitle: string;
	/** ISO date string e.g. "2026-05-15" */
	date: string;
	blocks: PostBlock[];
};

export { blogImages, blogImageSrc };

/*
 * Markdown posts live at src/posts/<slug>.md.
 *
 * Frontmatter:
 *   title:    required
 *   subtitle: required
 *   date:     required, ISO YYYY-MM-DD string
 *
 * Body block syntax:
 *   - Paragraphs separated by blank lines render as body text.
 *   - Lines starting with one or more `#` followed by space render as section headers
 *     (e.g. `## The Dreamscape of Koholint`).
 *   - Standard markdown image syntax: `![alt](Filename.png)` or
 *     `![alt](Filename.png "Caption text")`. Alt and caption are optional.
 *     The filename must exist in src/assets/blog/.
 *   - To put multiple images on a single row (side-by-side, useful for small
 *     assets), place two or more image tokens on the same line separated by
 *     whitespace, e.g.
 *       `![](a.png) ![](b.png "Caption B") ![](c.png)`
 *     A line with a single image still becomes a normal full-width figure.
 *
 * Inline formatting inside text, headers, and image captions:
 *   - `**bold**` or `__bold__`   → <strong>
 *   - `*italic*` or `_italic_`   → <em>
 *   Combine for bold-italic: `***both***`. All other HTML is escaped.
 */

const rawPosts = import.meta.glob<string>('../posts/*.md', {
	eager: true,
	query: '?raw',
	import: 'default',
});

function slugFromPath(path: string): string {
	return (path.split('/').pop() ?? '').replace(/\.md$/, '');
}

function stripQuotes(value: string): string {
	if (
		value.length >= 2 &&
		((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'")))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
	if (!match) return { frontmatter: {}, body: raw };

	const [, frontmatterText, body] = match;
	const frontmatter: Record<string, string> = {};

	for (const line of (frontmatterText ?? '').split(/\r?\n/)) {
		const m = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
		if (!m) continue;
		const [, key, rawValue] = m;
		if (!key) continue;
		frontmatter[key] = stripQuotes((rawValue ?? '').trim());
	}

	return { frontmatter, body: body ?? '' };
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Escapes HTML, then converts inline markdown emphasis to <strong>/<em>.
 * Bold runs are converted before italics so that `***both***` works correctly.
 * Underscore italics use word-boundary lookarounds so snake_case identifiers are left alone.
 */
export function renderInlineMarkdown(value: string): string {
	return escapeHtml(value)
		.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^\n]+?)__/g, '<strong>$1</strong>')
		.replace(/\*([^\s*][^\n*]*?[^\s*]|[^\s*])\*/g, '<em>$1</em>')
		.replace(/(?<![A-Za-z0-9_])_([^\s_][^\n_]*?[^\s_]|[^\s_])_(?![A-Za-z0-9_])/g, '<em>$1</em>');
}

/**
 * If `line` consists entirely of one or more markdown image tokens separated
 * only by whitespace, returns the parsed tokens. Otherwise returns null so the
 * line can be treated as regular paragraph text.
 */
function parseImageOnlyLine(
	line: string,
): { file: string; alt?: string; caption?: string }[] | null {
	const imageRe = /!\[([^\]]*)\]\(([^)\s"]+)(?:\s+"([^"]*)")?\)/g;
	const tokens: { file: string; alt?: string; caption?: string }[] = [];
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = imageRe.exec(line)) !== null) {
		const between = line.slice(cursor, match.index);
		if (between.trim() !== '') return null;
		const [, alt, file, caption] = match;
		if (!file) return null;
		const token: { file: string; alt?: string; caption?: string } = { file };
		if (alt) token.alt = alt;
		if (caption) token.caption = caption;
		tokens.push(token);
		cursor = match.index + match[0].length;
	}
	if (tokens.length === 0) return null;
	if (line.slice(cursor).trim() !== '') return null;
	return tokens;
}

function parseMarkdownBody(body: string): PostBlock[] {
	const blocks: PostBlock[] = [];
	const lines = body.replace(/\r\n/g, '\n').split('\n');
	let paragraph: string[] = [];

	function flush(): void {
		if (paragraph.length === 0) return;
		const content = paragraph.join(' ').trim();
		if (content) blocks.push({ type: 'text', content });
		paragraph = [];
	}

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (line === '') {
			flush();
			continue;
		}

		const headerMatch = /^#+\s+(.+)$/.exec(line);
		if (headerMatch) {
			const [, headerContent] = headerMatch;
			if (headerContent) {
				flush();
				blocks.push({ type: 'text', header: true, content: headerContent.trim() });
				continue;
			}
		}

		const imageTokens = parseImageOnlyLine(line);
		if (imageTokens && imageTokens.length > 0) {
			flush();
			if (imageTokens.length === 1) {
				const [first] = imageTokens;
				if (first) {
					const block: ImageBlock = { type: 'image', file: first.file };
					if (first.alt) block.alt = first.alt;
					if (first.caption) block.caption = first.caption;
					blocks.push(block);
				}
			} else {
				blocks.push({ type: 'imageRow', images: imageTokens });
			}
			continue;
		}

		paragraph.push(line);
	}

	flush();
	return blocks;
}

export const blogPosts: TheoryPost[] = Object.entries(rawPosts).map(([path, raw]) => {
	const slug = slugFromPath(path);
	const { frontmatter, body } = parseFrontmatter(raw);

	const title = frontmatter.title;
	const subtitle = frontmatter.subtitle;
	const date = frontmatter.date;

	if (!title) throw new Error(`Blog post "${slug}" is missing required frontmatter field: title`);
	if (!subtitle) throw new Error(`Blog post "${slug}" is missing required frontmatter field: subtitle`);
	if (!date) throw new Error(`Blog post "${slug}" is missing required frontmatter field: date`);

	return {
		slug,
		title,
		subtitle,
		date,
		blocks: parseMarkdownBody(body),
	};
});

export function getPostBySlug(slug: string): TheoryPost | undefined {
	return blogPosts.find((p) => p.slug === slug);
}

/** Newest first by ISO date string (lexicographic compare works for YYYY-MM-DD). */
export function getPostsNewestFirst(): TheoryPost[] {
	return [...blogPosts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function formatPostDate(iso: string): string {
	const [year, month, day] = iso.split('-').map(Number);
	if (!year || !month || !day) return iso;
	return new Date(year, month - 1, day).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}
