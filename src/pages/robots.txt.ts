import type { APIRoute } from 'astro';

function buildRobotsBody(sitemapHref: string): string {
	return [
		'User-agent: *',
		'Allow: /',
		'',
		`Sitemap: ${sitemapHref}`,
		'',
	].join('\n');
}

export const GET: APIRoute = ({ site }) => {
	const base = site ?? new URL('http://localhost:4321');
	const sitemapUrl = new URL('sitemap-index.xml', base);
	return new Response(buildRobotsBody(sitemapUrl.href), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
