import { fromHono } from "chanfana";
import { Hono } from "hono";
import { DeleteEnvVar } from "./deleteEnvVar";
import { ListEnvVars } from "./listEnvVars";
import { SetEnvVars } from "./setEnvVars";

export const envVarsRouter = fromHono(new Hono());

envVarsRouter.get("/", ListEnvVars);
envVarsRouter.put("/", SetEnvVars);
envVarsRouter.delete("/:key", DeleteEnvVar);
