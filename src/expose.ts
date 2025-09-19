import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import { Effect } from "effect";
import type { IService, IServiceRPC } from "./interface";

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
 *   start() {
 *     return Effect.sync(() => {
 *       console.log("Worker service started");
 *       this.running = true;
 *     });
 *   }
 *
 *   stop() {
 *     return Effect.sync(() => {
 *       console.log("Worker service stopped");
 *       this.running = false;
 *     });
 *   }
 *
 *   healthCheck() {
 *     return Effect.succeed<HealthCheckResult>({
 *       status: this.running ? "running" : "stopped",
 *       details: {
 *         // Custom health check details
 *       },
 *     });
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
  const rpc = new RPCChannel<IServiceRPC, object, DestroyableIoInterface>(io, {
    expose: {
      start: () => Effect.runPromise(service.start()),
      stop: () => Effect.runPromise(service.stop()),
      healthCheck: () => Effect.runPromise(service.healthCheck()),
    },
  });
}
