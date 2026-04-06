import { fromHono } from "chanfana";
import { Hono } from "hono";
import { DeleteUser } from "./deleteUser";
import { UserDetails } from "./userDetails";

export const userRouter = fromHono(new Hono());

userRouter.get("/me", UserDetails);
userRouter.delete("/me", DeleteUser);
