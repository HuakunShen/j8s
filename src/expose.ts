import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IService } from "./interface";

/**
 * Exposes a service implementation in a worker thread.
 * This function handles all the boilerplate code needed to expose a service
 * implementation through RPC to the main thread.
 *
 * @param service - The service implementation to expose
 * @example
 * ```ts
 * // worker.ts
 * import { expose } from "j8s";
 * import type { HealthCheckResult, IService } from "j8s";
 *
 * class WorkerService implements IService {
 *   name = "worker-service";
 *   private running = false;
 *
 *   async start(): Promise<void> {
 *     console.log("Worker service started");
 *     this.running = true;
 *   }
 *
 *   async stop(): Promise<void> {
 *     console.log("Worker service stopped");
 *     this.running = false;
 *   }
 *
 *   async healthCheck(): Promise<HealthCheckResult> {
 *     return {
 *       status: this.running ? "running" : "stopped",
 *       details: {
 *         // Custom health check details
 *       },
 *     };
 *   }
 * }
 *
 * // Expose the service - no need for manual RPC setup
 * expose(new WorkerService());
 * ```
 */
export function expose(service: IService): void {
  const io: DestroyableIoInterface = new WorkerChildIO();

  // Create RPC channel and expose the service
  const rpc = new RPCChannel<IService, object, DestroyableIoInterface>(io, {
    expose: service,
  });
}
