import MarkdownIt from "markdown-it";
import { codeToHtml } from "shiki";

const md = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
});

md.renderer.rules.fence = (tokens, idx) => {
	const token = tokens[idx];
	const code = token.content;
	const lang = token.info.trim() || "text";

	try {
		const highlighted = codeToHtml(code, {
			lang,
			themes: {
				light: "github-light",
				dark: "github-dark",
			},
		});
		return `<div class="shiki-wrapper">${highlighted}</div>`;
	} catch {
		return `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`;
	}
};

export { md };
