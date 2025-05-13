import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { HealthCheckResult, IService, ServiceStatus } from "./interface";
import { BaseService } from "./BaseService";

export interface WorkerServiceOptions {
  workerURL: string | URL;
  workerOptions?: WorkerOptions;
  autoTerminate?: boolean; // Whether to auto-terminate the worker after start() completes
}

export class WorkerService extends BaseService {
  private worker: Worker | null = null;
  private io: DestroyableIoInterface | null = null;
  private rpc: RPCChannel<object, IService, DestroyableIoInterface> | null =
    null;
  private api: IService | null = null;
  private options: WorkerServiceOptions;
  private autoTerminating = false;
  private terminateTimeout: NodeJS.Timeout | null = null;

  constructor(name: string, options: WorkerServiceOptions) {
    super(name);
    this.options = options;
  }

  private initWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(
      this.options.workerURL,
      this.options.workerOptions,
    );
    this.io = new WorkerParentIO(this.worker);
    this.rpc = new RPCChannel<object, IService, DestroyableIoInterface>(
      this.io,
      {},
    );
    this.api = this.rpc.getAPI();

    // Monitor worker termination
    this.worker.addEventListener("error", () => {
      this.setStatus("crashed");
      this.cleanup();
    });

    this.worker.addEventListener("messageerror", () => {
      this.setStatus("unhealthy");
    });

    // Handle clean worker exit
    if (this.options.autoTerminate) {
      this.autoTerminating = true;
    }
  }

  private cleanup(): void {
    if (this.terminateTimeout) {
      clearTimeout(this.terminateTimeout);
      this.terminateTimeout = null;
    }

    if (this.io) {
      try {
        this.io.destroy();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.io = null;
    }

    this.worker = null;
    this.rpc = null;
    this.api = null;
  }

  public async start(): Promise<void> {
    try {
      this.setStatus("starting");
      this.initWorker();

      if (!this.api) {
        throw new Error("Failed to initialize worker");
      }

      await this.api.start();
      this.setStatus("running");

      if (this.options.autoTerminate && this.io) {
        // For jobs that are meant to run and exit
        this.setStatus("stopping");
        this.io.destroy();
        this.cleanup();
        this.setStatus("stopped");
      }
    } catch (error) {
      this.setStatus("crashed");
      this.cleanup();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.getStatus() === "stopped" || !this.api) {
      return;
    }

    try {
      this.setStatus("stopping");
      await this.api.stop();
      if (this.io) {
        this.io.destroy();
      }
      this.cleanup();
      this.setStatus("stopped");
    } catch (error) {
      this.setStatus("crashed");
      this.cleanup();
      throw error;
    }
  }

  public async healthCheck(): Promise<HealthCheckResult> {
    const status = this.getStatus();

    if (status === "running" && this.api) {
      try {
        // Try to get health check from the worker service itself
        return await this.api.healthCheck();
      } catch (error) {
        return {
          status: "unhealthy",
          details: { error: String(error) },
        };
      }
    }

    // Return our tracked status if we can't reach the worker
    return {
      status,
      details: { isWorker: true },
    };
  }
}
