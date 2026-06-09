import { fromHono } from "chanfana";
import { Hono } from "hono";
import { CreateProject } from "./createProject";
import { DeleteProject } from "./deleteProject";
import { GetProject } from "./getProject";
import { ListProjects } from "./listProjects";
import { UpdateProject } from "./updateProject";

export const projectsRouter = fromHono(new Hono());

projectsRouter.get("/", ListProjects);
projectsRouter.post("/", CreateProject);
projectsRouter.get("/:projectId", GetProject);
projectsRouter.put("/:projectId", UpdateProject);
projectsRouter.delete("/:projectId", DeleteProject);
