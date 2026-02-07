import { fromHono } from "chanfana";
import { Hono } from "hono";
import { UserDetails } from "./userDetails";

export const userRouter = fromHono(new Hono());

userRouter.get("/me", UserDetails);
