import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { HealthCheckResult, IService, ServiceStatus } from "./interface";
import { BaseService } from "./BaseService";

// Use the global Worker API (web workers) instead of node:worker_threads
// kkrpc expects the web Worker API which is available in Bun/Deno/browsers
// @ts-ignore - Worker is a global in Bun
type WorkerType = Worker;

export interface WorkerServiceOptions {
  workerURL: string | URL;
  workerOptions?: any; // Use any for web worker options (compatible with both Bun/Deno/browsers)
  workerData?: any; // Custom data to be passed to the worker
  autoTerminate?: boolean; // Whether to auto-terminate the worker after start() completes
}

export class WorkerService extends BaseService {
  private worker: WorkerType | null = null;
  private io: DestroyableIoInterface | null = null;
  private rpc: RPCChannel<object, IService, DestroyableIoInterface> | null =
    null;
  private api: IService | null = null;
  private options: WorkerServiceOptions;
  private autoTerminating = false;
  private terminateTimeout: NodeJS.Timeout | null = null;
  private workerStatus: ServiceStatus = "stopped";

  constructor(name: string, options: WorkerServiceOptions) {
    super(name);
    this.options = options;
  }

  private initWorker(): void {
    // Clean up any existing worker to ensure a fresh start
    this.cleanup();

    try {
      // Merge default worker options with custom options and add workerData
      const workerOptions: any = {
        type: "module", // Always use module type for ESM
        ...(this.options.workerOptions || {}),
        ...(this.options.workerData !== undefined
          ? { workerData: this.options.workerData }
          : {}),
      };

      // Create worker with URL.href like kkrpc tests do
      const workerPath = typeof this.options.workerURL === 'string' 
        ? this.options.workerURL
        : this.options.workerURL.href;
      
      // Use global Worker API (web workers) - available in Bun/Deno/browsers
      this.worker = new Worker(workerPath, workerOptions);
      this.io = new WorkerParentIO(this.worker);
      
      // Create RPC channel - note: main thread doesn't need to expose anything
      this.rpc = new RPCChannel<object, IService, DestroyableIoInterface>(
        this.io,
        {}
      );
      this.api = this.rpc.getAPI();

      // Monitor worker events using web Worker API
      this.worker.addEventListener("error", (event) => {
        console.error(`Worker error event for ${this.name}:`, event);
        this.workerStatus = "crashed";
        this.cleanup();
      });

      this.worker.addEventListener("messageerror", (event) => {
        console.error(`Worker message error for ${this.name}:`, event);
        this.workerStatus = "unhealthy";
      });

      // Handle clean worker exit
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

  public async start(): Promise<void> {
    try {
      // Set status to running right away
      this.workerStatus = "running";
      this.initWorker();

      if (!this.api) {
        throw new Error(`Failed to initialize worker for ${this.name}`);
      }

      // Make sure API is ready by calling a method
      await this.api.start();

      if (this.options.autoTerminate && this.io) {
        // For jobs that are meant to run and exit
        this.workerStatus = "stopping";
        this.cleanup();
        this.workerStatus = "stopped";
      }
    } catch (error) {
      console.error(`Error starting worker service ${this.name}:`, error);
      this.workerStatus = "crashed";
      this.cleanup();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.workerStatus === "stopped" || !this.api) {
      return;
    }

    try {
      this.workerStatus = "stopping";

      try {
        // Attempt to stop gracefully
        await this.api.stop();
      } catch (error) {
        console.error(`Error during API stop for ${this.name}:`, error);
        // Continue with cleanup even if stop call fails
      }

      this.cleanup();
      this.workerStatus = "stopped";
    } catch (error) {
      console.error(`Error stopping worker service ${this.name}:`, error);
      this.workerStatus = "crashed";
      this.cleanup();
      throw error;
    }
  }

  public override async healthCheck(): Promise<HealthCheckResult> {
    if (this.workerStatus === "running" && this.api) {
      try {
        // Try to get health check from the worker service itself
        return await this.api.healthCheck();
      } catch (error) {
        console.error(`Health check failed for ${this.name}:`, error);
        return {
          status: "unhealthy",
          details: { error: String(error) },
        };
      }
    }

    // Return our tracked status if we can't reach the worker
    return {
      status: this.workerStatus,
      details: { isWorker: true },
    };
  }
}
