import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IService } from "../src/interface";

const io: DestroyableIoInterface = new WorkerChildIO();

class LoggingService implements IService {
  name = "loggingService";
  async start(): Promise<void> {
    console.log("loggingService started");
    let count = 0;
    setInterval(() => {
      console.log("loggingService log", count++);
    }, 1000);
  }
  async stop(): Promise<void> {
    console.log("loggingService stopped");
  }
}

const rpc = new RPCChannel<IService, object, DestroyableIoInterface>(io, {
  expose: new LoggingService(),
});
const api = rpc.getAPI();
