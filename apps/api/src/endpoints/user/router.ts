import { Hono } from "hono";
import { fromHono } from "chanfana";
import { UserDetails } from "./userDetails";

export const userRouter = fromHono(new Hono());

userRouter.get("/me", UserDetails);
