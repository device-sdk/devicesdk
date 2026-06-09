/**
 * Writes openapi.json for the website's API reference. Imports the Hono app
 * (no server boot, no database) and asks chanfana for the generated schema.
 */
import { app } from "../src/index";

const response = await app.request("/openapi.json", {}, {
	// Bare-minimum env: the qb/services middlewares tolerate undefined values
	// because the schema route never touches them.
} as never);

if (response.status !== 200) {
	console.error(`openapi route returned ${response.status}`);
	process.exit(1);
}
const schema = (await response.json()) as { paths?: Record<string, unknown> };
await Bun.write(
	new URL("../openapi.json", import.meta.url).pathname,
	`${JSON.stringify(schema, null, 2)}\n`,
);
console.log(
	`openapi.json written (${Object.keys(schema.paths ?? {}).length} paths)`,
);
