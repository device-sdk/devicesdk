import { fromHono } from "chanfana";
import { Hono } from "hono";
import { pollAuth } from "./pollAuth";
import { refreshToken } from "./refreshToken";
import { revokeToken } from "./revokeToken";
import { startAuth } from "./startAuth";

export const cliAuthRouterPreAuth = fromHono(new Hono());
cliAuthRouterPreAuth.post("/start", startAuth);
cliAuthRouterPreAuth.post("/poll", pollAuth);
cliAuthRouterPreAuth.post("/refresh", refreshToken);

export const cliAuthRouterPostAuth = fromHono(new Hono());
// Authenticated endpoint
cliAuthRouterPostAuth.post("/revoke", revokeToken);
