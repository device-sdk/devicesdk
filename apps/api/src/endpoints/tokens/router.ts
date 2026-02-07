import { fromHono } from "chanfana";
import { Hono } from "hono";
import { CreateApiToken } from "./createApiToken";
import { DeleteApiToken } from "./deleteApiToken";
import { ListApiTokens } from "./listApiTokens";

export const tokensRouter = fromHono(new Hono());

tokensRouter.get("/", ListApiTokens);
tokensRouter.post("/", CreateApiToken);
tokensRouter.delete("/:tokenId", DeleteApiToken);
