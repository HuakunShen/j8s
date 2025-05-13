import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { HealthCheckResult, IService } from "../src/interface";

const io: DestroyableIoInterface = new WorkerChildIO();

// setTimeout(() => {
//   io.destroy();
// }, 1000);

class LoggingService implements IService {
  name = "loggingService";
  private isRunning = false;
  private logInterval: NodeJS.Timeout | null = null;
  private startTime = 0;

  async start(): Promise<void> {
    console.log("loggingService started");
    this.isRunning = true;
    this.startTime = Date.now();

    let count = 0;
    this.logInterval = setInterval(() => {
      console.log("loggingService log", count++);
    }, 1000);
  }

  async stop(): Promise<void> {
    console.log("loggingService stopped");
    this.isRunning = false;

    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
        logs: "healthy",
      },
    };
  }
}

const rpc = new RPCChannel<IService, object, DestroyableIoInterface>(io, {
  expose: new LoggingService(),
});
const api = rpc.getAPI();
