import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IService } from "./src/interface";

const worker = new Worker(
  new URL("./examples/mathService.ts", import.meta.url).href,
  { type: "module" }
);
const io = new WorkerParentIO(worker);
const rpc = new RPCChannel<object, IService, DestroyableIoInterface>(io, {});
const api = rpc.getAPI();
await api.start();

await api.stop();
await io.destroy();
