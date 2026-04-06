import { fromHono } from "chanfana";
import { Hono } from "hono";
import { ListLogs } from "./listLogs";
import { streamLogs } from "./streamLogs";

export const logsRouter = fromHono(new Hono());

logsRouter.get("/stream", streamLogs);
logsRouter.get("/", ListLogs);
