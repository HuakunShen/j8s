import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IService } from "../src/interface";

const io: DestroyableIoInterface = new WorkerChildIO();

class MathService implements IService {
  name = "mathService";
  async start(): Promise<void> {
    console.log("mathService started");
  }
  async stop(): Promise<void> {
    console.log("mathService stopped");
  }
}

const rpc = new RPCChannel<IService, object, DestroyableIoInterface>(io, {
  expose: new MathService(),
});
const api = rpc.getAPI();
