import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import { Effect } from "effect";
import { Worker as NodeWorker } from "node:worker_threads";
import type { WorkerOptions } from "node:worker_threads";
import type {
  HealthCheckResult,
  IService,
  IServiceRPC,
  ServiceStatus,
} from "./interface";
import { BaseService } from "./BaseService";

export interface WorkerServiceOptions {
  workerURL: string | URL;
  workerOptions?: WorkerOptions;
  workerData?: any; // Custom data to be passed to the worker
  autoTerminate?: boolean; // Whether to auto-terminate the worker after start() completes
}

export class WorkerService extends BaseService {
  private worker: NodeWorker | null = null;
  private io: DestroyableIoInterface | null = null;
  private rpc: RPCChannel<object, IServiceRPC, DestroyableIoInterface> | null =
    null;
  private api: IServiceRPC | null = null;
  private options: WorkerServiceOptions;
  private autoTerminating = false;
  private terminateTimeout: NodeJS.Timeout | null = null;
  private workerStatus: ServiceStatus = "stopped";

  constructor(name: string, options: WorkerServiceOptions) {
    super(name);
    this.options = options;
  }

  private initWorker(): void {
    this.cleanup();

    try {
      const workerOptions: WorkerOptions = {
        ...(this.options.workerOptions || {}),
        ...(this.options.workerData !== undefined
          ? { workerData: this.options.workerData }
          : {}),
      };

      this.worker = new NodeWorker(this.options.workerURL.toString(), workerOptions);
      this.io = new WorkerParentIO(this.worker as any);
      this.rpc = new RPCChannel<object, IServiceRPC, DestroyableIoInterface>(
        this.io,
        {}
      );
      this.api = this.rpc.getAPI();

      this.worker.addListener("error", (event) => {
        console.error(`Worker error event for ${this.name}:`, event);
        this.workerStatus = "crashed";
        this.cleanup();
      });

      this.worker.addListener("messageerror", (event) => {
        console.error(`Worker message error for ${this.name}:`, event);
        this.workerStatus = "unhealthy";
      });

      if (this.options.autoTerminate) {
        this.autoTerminating = true;
      }
    } catch (error) {
      console.error(`Error initializing worker for ${this.name}:`, error);
      this.workerStatus = "crashed";
      throw error;
    }
  }

  private cleanup(): void {
    if (this.terminateTimeout) {
      clearTimeout(this.terminateTimeout);
      this.terminateTimeout = null;
    }

    // Clean up IO and RPC before destroying worker to prevent dangling connections
    if (this.io) {
      try {
        this.io.destroy();
      } catch (error) {
        console.error(`Error destroying IO for ${this.name}:`, error);
        // Continue cleanup despite errors
      }
      this.io = null;
    }

    // Terminate worker if it exists
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (error) {
        console.error(`Error terminating worker for ${this.name}:`, error);
        // Continue cleanup despite errors
      }
    }

    this.worker = null;
    this.rpc = null;
    this.api = null;
  }

  protected onStart(): Effect.Effect<void, unknown> {
    return Effect.tryPromise(async () => {
      this.workerStatus = "running";
      this.initWorker();

      if (!this.api) {
        throw new Error(`Failed to initialize worker for ${this.name}`);
      }

      await this.api.start();

      if (this.options.autoTerminate && this.io) {
        this.workerStatus = "stopping";
        this.cleanup();
        this.workerStatus = "stopped";
      }
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          console.error(`Error starting worker service ${this.name}:`, error);
          this.workerStatus = "crashed";
          this.cleanup();
        })
      )
    );
  }

  protected onStop(): Effect.Effect<void, unknown> {
    return Effect.tryPromise(async () => {
      if (this.workerStatus === "stopped" || !this.api) {
        return;
      }

      this.workerStatus = "stopping";

      try {
        await this.api.stop();
      } catch (error) {
        console.error(`Error during API stop for ${this.name}:`, error);
      }

      this.cleanup();
      this.workerStatus = "stopped";
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          console.error(`Error stopping worker service ${this.name}:`, error);
          this.workerStatus = "crashed";
          this.cleanup();
        })
      )
    );
  }

  public override healthCheck(): Effect.Effect<HealthCheckResult, unknown> {
    if (this.workerStatus === "running" && this.api) {
      return Effect.tryPromise(() => this.api!.healthCheck()).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            console.error(`Health check failed for ${this.name}:`, error);
          })
        ),
        Effect.catchAll((error) =>
          Effect.succeed({
            status: "unhealthy",
            details: { error: String(error) },
          } as HealthCheckResult)
        )
      );
    }

    return Effect.succeed({
      status: this.workerStatus,
      details: { isWorker: true },
    });
  }
}
