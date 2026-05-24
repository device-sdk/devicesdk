import { fromHono } from "chanfana";
import { Hono } from "hono";
import { ListLogs } from "./listLogs";

export const logsRouter = fromHono(new Hono());

logsRouter.get("/", ListLogs);
