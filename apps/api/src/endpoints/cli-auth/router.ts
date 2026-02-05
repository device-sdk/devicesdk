import { Hono } from "hono";
import { fromHono } from "chanfana";
import { startAuth } from "./startAuth";
import { pollAuth } from "./pollAuth";
import { refreshToken } from "./refreshToken";
import { revokeToken } from "./revokeToken";

export const cliAuthRouterPreAuth = fromHono(new Hono());
cliAuthRouterPreAuth.post("/start", startAuth);
cliAuthRouterPreAuth.post("/poll", pollAuth);
cliAuthRouterPreAuth.post("/refresh", refreshToken);

export const cliAuthRouterPostAuth = fromHono(new Hono());
// Authenticated endpoint
cliAuthRouterPostAuth.post("/revoke", revokeToken);
