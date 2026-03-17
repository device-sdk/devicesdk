import { fromHono } from "chanfana";
import { Hono } from "hono";
import { CreateDevice } from "./createDevice";
import { DeleteDevice } from "./deleteDevice";
import { DeviceConnect } from "./deviceConnect";
import { DownloadFirmware } from "./downloadFirmware";
import { GetDevice } from "./getDevice";
import { GetDeviceStatus } from "./getDeviceStatus";
import { ListDevices } from "./listDevices";
import { SendDeviceCommand } from "./sendCommand";
import { UpdateDevice } from "./updateDevice";

export const devicesRouter = fromHono(new Hono());

devicesRouter.get("/", ListDevices);
devicesRouter.post("/", CreateDevice);
devicesRouter.get("/:deviceId", GetDevice);
devicesRouter.put("/:deviceId", UpdateDevice);
devicesRouter.delete("/:deviceId", DeleteDevice);
devicesRouter.get("/:deviceId/status", GetDeviceStatus);
devicesRouter.get("/:deviceId/connect/websocket", DeviceConnect);
devicesRouter.post("/:deviceId/firmware", DownloadFirmware);
devicesRouter.post("/:deviceId/command", SendDeviceCommand);
