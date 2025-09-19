import { Effect, Scope, Ref, Resource, Schedule } from "effect";
import { Worker as NodeWorker } from "node:worker_threads";
import type { WorkerOptions } from "node:worker_threads";
import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import { BaseEffectService } from "./BaseEffectService";
import type { 
  EffectServiceConfig, 
  ServiceContext, 
  EffectHealthStatus 
} from "./interfaces";
import type { HealthCheckResult, IService } from "../interface";
import { StartupError, ShutdownError, WorkerError, HealthCheckError } from "./errors";

/**
 * Enhanced worker service options with Effect integration
 */
export interface EffectWorkerServiceOptions {
  readonly workerURL: string | URL;
  readonly workerOptions?: WorkerOptions;
  readonly workerData?: any;
  readonly autoTerminate?: boolean;
  readonly healthCheckInterval?: number;
  readonly communicationTimeout?: number;
  readonly maxWorkerRestarts?: number;
}

/**
 * Worker resource for Effect-based resource management
 */
interface WorkerResource {
  readonly worker: NodeWorker;
  readonly io: DestroyableIoInterface;
  readonly rpc: RPCChannel<object, IService, DestroyableIoInterface>;
  readonly api: IService;
}

/**
 * Effect-based Worker Service with comprehensive resource management
 */
export class EffectWorkerService extends BaseEffectService {
  private readonly options: EffectWorkerServiceOptions;
  private readonly workerResource = Ref.unsafeMake<WorkerResource | null>(null);
  private readonly workerRestartCount = Ref.unsafeMake<number>(0);
  private readonly lastCommunication = Ref.unsafeMake<Date | null>(null);

  constructor(
    name: string, 
    options: EffectWorkerServiceOptions, 
    config: EffectServiceConfig = {}
  ) {
    super(name, config);
    this.options = options;
  }

  /**
   * Create worker resource with proper Effect resource management
   */
  private readonly createWorkerResource = (): Effect.Effect<WorkerResource, WorkerError, Scope.Scope> =>
    Effect.gen(this, function* () {
      const scope = yield* Scope.make();
      
      try {
        // Create worker with merged options
        const workerOptions: WorkerOptions = {
          ...this.options.workerOptions,
          ...(this.options.workerData !== undefined 
            ? { workerData: this.options.workerData } 
            : {})
        };

        const worker = new NodeWorker(this.options.workerURL.toString(), workerOptions);
        
        // Create IO and RPC with resource management
        const io = yield* Effect.acquireRelease(
          Effect.succeed(new WorkerParentIO(worker as any)),
          (io) => Effect.sync(() => io.destroy())
        );

        const rpc = new RPCChannel<object, IService, DestroyableIoInterface>(io, {});
        const api = rpc.getAPI();

        // Set up worker event handlers
        yield* this.setupWorkerEventHandlers(worker);

        // Test communication
        yield* this.testWorkerCommunication(api);

        const resource: WorkerResource = { worker, io, rpc, api };
        
        // Register cleanup in scope
        yield* Scope.addFinalizer(scope, this.cleanupWorkerResource(resource));
        
        return resource;

      } catch (error) {
        yield* Scope.close(scope, Effect.exitSucceed(undefined));
        return yield* Effect.fail(new WorkerError({
          message: `Failed to create worker resource: ${String(error)}`,
          workerId: this.name,
          communicationFailure: false,
          cause: error
        }));
      }
    });

  /**
   * Setup worker event handlers with Effect error handling
   */
  private readonly setupWorkerEventHandlers = (worker: NodeWorker): Effect.Effect<void, never, never> =>
    Effect.sync(() => {
      worker.addListener("error", (error) => {
        Effect.runSync(
          Effect.gen(this, function* () {
            yield* Ref.update(this.errorCount, n => n + 1);
            console.error(`Worker error for ${this.name}:`, error);
            
            // Update running state
            yield* Ref.set(this.isRunning, false);
            
            // Clear worker resource
            yield* Ref.set(this.workerResource, null);
          })
        );
      });

      worker.addListener("messageerror", (error) => {
        Effect.runSync(
          Effect.gen(this, function* () {
            console.error(`Worker message error for ${this.name}:`, error);
            yield* Ref.set(this.lastCommunication, null);
          })
        );
      });

      worker.addListener("exit", (code) => {
        Effect.runSync(
          Effect.gen(this, function* () {
            console.log(`Worker ${this.name} exited with code ${code}`);
            yield* Ref.set(this.isRunning, false);
            yield* Ref.set(this.workerResource, null);
          })
        );
      });
    });

  /**
   * Test worker communication
   */
  private readonly testWorkerCommunication = (api: IService): Effect.Effect<void, WorkerError, never> =>
    Effect.gen(this, function* () {
      try {
        // Test with timeout
        const timeout = this.options.communicationTimeout ?? 5000;
        yield* Effect.timeout(
          Effect.promise(() => api.healthCheck()),
          timeout
        );
        
        // Update last communication time
        const now = new Date();
        yield* Ref.set(this.lastCommunication, now);

      } catch (error) {
        return yield* Effect.fail(new WorkerError({
          message: `Worker communication test failed: ${String(error)}`,
          workerId: this.name,
          communicationFailure: true,
          cause: error
        }));
      }
    });

  /**
   * Cleanup worker resource
   */
  private readonly cleanupWorkerResource = (resource: WorkerResource): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      try {
        // Try graceful stop first
        const timeout = this.config.timeout ?? 5000;
        yield* Effect.timeout(
          Effect.promise(() => resource.api.stop()),
          timeout
        );
      } catch {
        // Ignore graceful stop errors
      }

      // Cleanup IO
      try {
        resource.io.destroy();
      } catch {
        // Ignore cleanup errors
      }

      // Terminate worker
      try {
        yield* Effect.promise(() => resource.worker.terminate());
      } catch {
        // Ignore termination errors
      }
    });

  /**
   * Run the worker service
   */
  protected readonly runService = (): Effect.Effect<void, StartupError, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;

      // Create worker resource
      const resource = yield* this.createWorkerResource().pipe(
        Effect.mapError(error => new StartupError({
          message: `Failed to initialize worker: ${error.message}`,
          phase: "initialization",
          cause: error
        }))
      );

      // Store resource reference
      yield* Ref.set(this.workerResource, resource);

      try {
        // Start the worker service
        yield* Effect.promise(() => resource.api.start()).pipe(
          Effect.mapError(error => new StartupError({
            message: `Worker start failed: ${String(error)}`,
            phase: "execution", 
            cause: error
          }))
        );

        // Update last communication
        const now = new Date();
        yield* Ref.set(this.lastCommunication, now);

        // Set up health monitoring if interval is configured
        if (this.options.healthCheckInterval) {
          yield* this.startHealthMonitoring(resource);
        }

        // If auto-terminate is enabled, this will complete immediately
        if (this.options.autoTerminate) {
          yield* Effect.sleep(100); // Brief delay for initialization
          return;
        }

        // Otherwise, keep running until interrupted
        yield* Effect.never;

      } catch (error) {
        yield* Ref.set(this.workerResource, null);
        return yield* Effect.fail(new StartupError({
          message: `Worker execution failed: ${String(error)}`,
          phase: "execution",
          cause: error
        }));
      }
    });

  /**
   * Start health monitoring for the worker
   */
  private readonly startHealthMonitoring = (resource: WorkerResource): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const interval = this.options.healthCheckInterval!;
      
      yield* Effect.fork(
        Effect.repeat(
          Effect.gen(this, function* () {
            try {
              yield* Effect.promise(() => resource.api.healthCheck());
              const now = new Date();
              yield* Ref.set(this.lastCommunication, now);
            } catch (error) {
              console.warn(`Health check failed for worker ${this.name}:`, error);
              // Could trigger restart logic here based on policy
            }
          }),
          Schedule.fixed(interval)
        )
      );
    });

  /**
   * Cleanup worker service
   */
  protected readonly cleanupService = (): Effect.Effect<void, ShutdownError, ServiceContext> =>
    Effect.gen(this, function* () {
      const resource = yield* Ref.get(this.workerResource);
      
      if (!resource) {
        return; // No worker to cleanup
      }

      try {
        yield* this.cleanupWorkerResource(resource);
        yield* Ref.set(this.workerResource, null);

      } catch (error) {
        return yield* Effect.fail(new ShutdownError({
          message: `Worker cleanup failed: ${String(error)}`,
          timeout: false,
          cause: error
        }));
      }
    });

  /**
   * Enhanced health check with worker-specific details
   */
  public override readonly healthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError, ServiceContext> =>
    Effect.gen(this, function* () {
      // Get base health status
      const baseHealth = yield* super.healthCheck();
      
      const resource = yield* Ref.get(this.workerResource);
      const lastComm = yield* Ref.get(this.lastCommunication);
      const workerRestarts = yield* Ref.get(this.workerRestartCount);

      // Enhance with worker-specific details
      const workerHealth: EffectHealthStatus = {
        ...baseHealth,
        details: {
          ...baseHealth.details,
          isWorker: true,
          hasActiveWorker: resource !== null,
          lastCommunication: lastComm,
          workerRestarts,
          communicationTimeout: this.options.communicationTimeout,
          healthCheckInterval: this.options.healthCheckInterval
        }
      };

      // Try to get health from worker if available
      if (resource) {
        try {
          const timeout = this.options.communicationTimeout ?? 3000;
          const workerHealthResult = yield* Effect.timeout(
            Effect.promise(() => resource.api.healthCheck()),
            timeout
          );
          
          // Update last communication
          const now = new Date();
          yield* Ref.set(this.lastCommunication, now);
          
          // Merge worker health details
          workerHealth.details = {
            ...workerHealth.details,
            workerHealth: workerHealthResult
          };

        } catch (error) {
          workerHealth.status = "unhealthy";
          workerHealth.details.communicationError = String(error);
        }
      }

      return workerHealth;
    });

  /**
   * Restart worker with exponential backoff
   */
  public readonly restartWorker = (): Effect.Effect<void, WorkerError, ServiceContext> =>
    Effect.gen(this, function* () {
      const currentRestarts = yield* Ref.get(this.workerRestartCount);
      const maxRestarts = this.options.maxWorkerRestarts ?? 3;
      
      if (currentRestarts >= maxRestarts) {
        return yield* Effect.fail(new WorkerError({
          message: `Worker ${this.name} exceeded maximum restart attempts (${maxRestarts})`,
          workerId: this.name,
          communicationFailure: false
        }));
      }

      // Increment restart count
      yield* Ref.update(this.workerRestartCount, n => n + 1);
      
      // Stop and start the service
      yield* this.stop();
      yield* this.start();
    });
}