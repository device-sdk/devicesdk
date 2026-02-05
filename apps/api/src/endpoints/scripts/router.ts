import { Hono } from "hono";
import { fromHono } from "chanfana";
import { UploadScript } from "./uploadScript";
import { GetScript } from "./getScript";
import { GetVersion } from "./getVersion";
import { ListVersions } from "./listVersions";
import { DeployVersion } from "./deployVersion";
import { BatchUploadScripts } from "./batchUpload";

export const scriptsRouter = fromHono(new Hono());

scriptsRouter.get("/", GetScript);
scriptsRouter.put("/", UploadScript);
scriptsRouter.get("/versions", ListVersions);
scriptsRouter.get("/versions/:versionId", GetVersion);
scriptsRouter.post("/versions/:versionId/deploy", DeployVersion);

// Batch upload router - mounted separately at /v1/projects/:projectId/scripts
export const batchScriptsRouter = fromHono(new Hono());
batchScriptsRouter.put("/", BatchUploadScripts);
