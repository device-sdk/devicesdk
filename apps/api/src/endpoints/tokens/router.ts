import { fromHono } from "chanfana";
import { Hono } from "hono";
import { CreateApiToken } from "./createApiToken";
import { DeleteApiToken } from "./deleteApiToken";
import { DeleteCliToken } from "./deleteCliToken";
import { ListApiTokens } from "./listApiTokens";
import { ListCliTokens } from "./listCliTokens";

export const tokensRouter = fromHono(new Hono());

tokensRouter.get("/", ListApiTokens);
tokensRouter.post("/", CreateApiToken);
tokensRouter.delete("/:tokenId", DeleteApiToken);

tokensRouter.get("/cli", ListCliTokens);
tokensRouter.delete("/cli/:tokenId", DeleteCliToken);
