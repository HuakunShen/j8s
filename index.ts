/**
 * j8s - JavaScript Service Orchestrator
 *
 * A lightweight service orchestration framework for JavaScript/TypeScript.
 * Run multiple services in a single process using worker threads.
 *
 * @example
 * ```ts
 * // Running a service in the main thread
 * import { BaseService, ServiceManager } from "j8s";
 *
 * class MyService extends BaseService {
 *   async start(): Promise<void> {
 *     console.log("Service started");
 *   }
 *
 *   async stop(): Promise<void> {
 *     console.log("Service stopped");
 *   }
 *
 *   async healthCheck(): Promise<HealthCheckResult> {
 *     return { status: "running" };
 *   }
 * }
 *
 * const manager = new ServiceManager();
 * const myService = new MyService("my-service");
 * manager.addService(myService, { restartPolicy: "always" });
 * await manager.startService(myService);
 * ```
 *
 * @example
 * ```ts
 * // Running a service in a worker thread
 * import { ServiceManager, createWorkerService } from "j8s";
 *
 * const workerService = createWorkerService(
 *   "worker-service",
 *   new URL("./worker.ts", import.meta.url),
 *   { autoTerminate: false }
 * );
 *
 * const manager = new ServiceManager();
 * manager.addService(workerService, {
 *   restartPolicy: "on-failure",
 *   maxRetries: 3,
 * });
 * await manager.startService(workerService);
 * ```
 *
 * @example
 * ```ts
 * // Running a service on a schedule
 * import { BaseService, ServiceManager, Schedule, Duration } from "effect";
 *
 * class BackupService extends BaseService {
 *   async start(): Promise<void> {
 *     console.log("Running backup...");
 *     // Do backup logic here
 *   }
 *
 *   async stop(): Promise<void> {}
 *
 *   async healthCheck(): Promise<HealthCheckResult> {
 *     return { status: "running" };
 *   }
 * }
 *
 * const manager = new ServiceManager();
 * const backupService = new BackupService("backup-service");
 *
 * manager.addService(backupService, {
 *   scheduledJob: {
 *     schedule: Schedule.cron("0 0 * * *"), // Run at midnight every day
 *     timeout: Duration.seconds(60), // 1 minute timeout
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * // Creating a worker service with the expose function
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
 *
 * @module
 */

// Export interfaces and types
export type {
  ServiceStatus,
  RestartPolicy,
  HealthCheckResult,
  IService,
  ScheduledJobConfig,
  ServiceConfig,
  IServiceManager,
} from "./src/interface";

/**
 * Base class for all services.
 */
export { BaseService } from "./src/BaseService";

/**
 * Service manager for managing all services.
 */
export { ServiceManager } from "./src/ServiceManager";

/**
 * Worker service for running services in a worker thread.
 */
export { WorkerService } from "./src/WorkerService";

/**
 * Options for the worker service.
 */
export type { WorkerServiceOptions } from "./src/WorkerService";

/**
 * Exposes a service implementation in a worker thread.
 * This function handles all the boilerplate code needed to expose a service
 * implementation through RPC to the main thread.
 */
export { expose } from "./src/expose";

// Enhanced Effect integration exports
export { EnhancedServiceAdapter } from "./src/EnhancedServiceAdapter";

/**
 * Effect-based service interface and base class
 */
export type { IEffectService } from "./src/IEffectService";
export { BaseEffectService, DatabaseEffectService } from "./src/IEffectService";

/**
 * Error handling utilities
 */
export {
  ServiceErrorType,
  StructuredServiceError,
  ServiceErrorHandling,
} from "./src/errors";

/**
 * Effect utilities for retry policies, resource management, concurrency control, and monitoring
 */
export {
  RetryPolicies,
  ResourceManager,
  Concurrency,
  Monitoring,
} from "./src/EffectUtils";

/**
 * Enhanced service manager that fully leverages Effect's capabilities
 */
export { EnhancedServiceManager } from "./src/EnhancedServiceManager";

/**
 * Web UI and API exports
 */
export { createServiceManagerUI } from "./src/ui";
export { createServiceManagerAPI } from "./src/api";

// Create a helper to create a worker-based service
import { WorkerService, type WorkerServiceOptions } from "./src/WorkerService";

/**
 * Creates a new worker-based service.
 * @param name - The name of the service.
 * @param workerPath - The path to the worker file.
 * @param options - The options for the worker service.
 * @param options.workerData - Custom data to be passed to the worker, accessible via workerData in the worker thread.
 * @param options.workerOptions - Options to pass to the Worker constructor.
 * @param options.autoTerminate - Whether to auto-terminate the worker after start() completes.
 * @returns A new worker-based service that can be added to the service manager.
 */
export function createWorkerService(
  name: string,
  workerPath: string | URL,
  options?: Partial<WorkerServiceOptions>
): WorkerService {
  const fullOptions: WorkerServiceOptions = {
    workerURL: workerPath,
    workerOptions: {},
    autoTerminate: false,
    ...options,
  };

  return new WorkerService(name, fullOptions);
}
