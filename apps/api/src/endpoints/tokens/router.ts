import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CreateApiToken } from "./createApiToken";
import { ListApiTokens } from "./listApiTokens";
import { DeleteApiToken } from "./deleteApiToken";

export const tokensRouter = fromHono(new Hono());

tokensRouter.get("/", ListApiTokens);
tokensRouter.post("/", CreateApiToken);
tokensRouter.delete("/:tokenId", DeleteApiToken);
