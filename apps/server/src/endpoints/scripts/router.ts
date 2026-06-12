import { fromHono } from "chanfana";
import { Hono } from "hono";
import { BatchUploadScripts } from "./batchUpload";
import { DeployVersion } from "./deployVersion";
import { GetScript } from "./getScript";
import { GetVersion } from "./getVersion";
import { ListVersions } from "./listVersions";
import { UploadScript } from "./uploadScript";

export const scriptsRouter = fromHono(new Hono());

scriptsRouter.get("/", GetScript);
scriptsRouter.put("/", UploadScript);
scriptsRouter.get("/versions", ListVersions);
scriptsRouter.get("/versions/:versionId", GetVersion);
scriptsRouter.post("/versions/:versionId/deploy", DeployVersion);

// Batch upload router - mounted separately at /v1/projects/:projectId/scripts
export const batchScriptsRouter = fromHono(new Hono());
batchScriptsRouter.put("/", BatchUploadScripts);
