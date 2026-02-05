import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CreateProject } from "./createProject";
import { ListProjects } from "./listProjects";
import { GetProject } from "./getProject";
import { UpdateProject } from "./updateProject";
import { DeleteProject } from "./deleteProject";

export const projectsRouter = fromHono(new Hono());

projectsRouter.get("/", ListProjects);
projectsRouter.post("/", CreateProject);
projectsRouter.get("/:projectId", GetProject);
projectsRouter.put("/:projectId", UpdateProject);
projectsRouter.delete("/:projectId", DeleteProject);
