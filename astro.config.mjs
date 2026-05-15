// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Canonical URL for SEO (sitemap, robots). Override with PUBLIC_SITE_URL on Cloudflare Pages if you use a custom domain. */
const site =
	process.env.PUBLIC_SITE_URL ||
	process.env.CF_PAGES_URL ||
	'http://localhost:4321';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const postsDir = resolve(projectRoot, 'src/posts');
const blogPostsModule = resolve(projectRoot, 'src/lib/blogPosts.ts');

/**
 * Watches src/posts/ for added/removed/changed markdown files during `astro dev`
 * and invalidates the blogPosts module + triggers a full reload so new posts
 * appear without restarting the dev server.
 * @returns {import('vite').Plugin}
 */
function watchBlogPosts() {
	return {
		name: 'dragmirexi:watch-blog-posts',
		apply: 'serve',
		configureServer(server) {
			server.watcher.add(postsDir);

			const reload = (file) => {
				if (!file.endsWith('.md')) return;
				const mod = server.moduleGraph.getModuleById(blogPostsModule);
				if (mod) server.moduleGraph.invalidateModule(mod);
				server.ws.send({ type: 'full-reload', path: '*' });
			};

			server.watcher.on('add', reload);
			server.watcher.on('unlink', reload);
			server.watcher.on('change', reload);
		},
	};
}

// https://astro.build/config
export default defineConfig({
	site,
	integrations: [sitemap()],
	vite: {
		optimizeDeps: {
			include: ['modern-screenshot'],
		},
		plugins: [watchBlogPosts()],
	},
});
