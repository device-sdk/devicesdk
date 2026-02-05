import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CreateDevice } from "./createDevice";
import { ListDevices } from "./listDevices";
import { GetDevice } from "./getDevice";
import { UpdateDevice } from "./updateDevice";
import { DeleteDevice } from "./deleteDevice";
import { DeviceConnect } from "./deviceConnect";
import { DownloadFirmware } from "./downloadFirmware";

export const devicesRouter = fromHono(new Hono());

devicesRouter.get("/", ListDevices);
devicesRouter.post("/", CreateDevice);
devicesRouter.get("/:deviceId", GetDevice);
devicesRouter.put("/:deviceId", UpdateDevice);
devicesRouter.delete("/:deviceId", DeleteDevice);
devicesRouter.get("/:deviceId/connect/websocket", DeviceConnect);
devicesRouter.post("/:deviceId/firmware", DownloadFirmware);
