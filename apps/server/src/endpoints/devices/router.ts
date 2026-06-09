import { fromHono } from "chanfana";
import { Hono } from "hono";
import { GetDeviceMetrics } from "../metrics/getDeviceMetrics";
import { CreateDevice } from "./createDevice";
import { DeleteDevice } from "./deleteDevice";
import { DownloadFirmware } from "./downloadFirmware";
import { GetDevice } from "./getDevice";
import { GetDeviceEntities } from "./getDeviceEntities";
import { GetDeviceStatus } from "./getDeviceStatus";
import { ListDevices } from "./listDevices";
import { SendDeviceCommand } from "./sendCommand";
import { UpdateDevice } from "./updateDevice";
import { UpsertDeviceEntities } from "./upsertDeviceEntities";

export const devicesRouter = fromHono(new Hono());

devicesRouter.get("/", ListDevices);
devicesRouter.post("/", CreateDevice);
devicesRouter.get("/:deviceId", GetDevice);
devicesRouter.put("/:deviceId", UpdateDevice);
devicesRouter.delete("/:deviceId", DeleteDevice);
devicesRouter.get("/:deviceId/status", GetDeviceStatus);
devicesRouter.get("/:deviceId/metrics", GetDeviceMetrics);
devicesRouter.get("/:deviceId/entities", GetDeviceEntities);
devicesRouter.put("/:deviceId/entities", UpsertDeviceEntities);
devicesRouter.post("/:deviceId/firmware", DownloadFirmware);
devicesRouter.post("/:deviceId/command", SendDeviceCommand);
