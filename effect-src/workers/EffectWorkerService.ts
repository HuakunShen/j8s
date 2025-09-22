import { Effect, Console, Ref, Fiber, Duration } from "effect"
import { Worker as NodeWorker } from "node:worker_threads"
import type { WorkerOptions } from "node:worker_threads"
import {
  RPCChannel,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc"
import type { 
  IEffectService, 
  ServiceError, 
  HealthCheckResult,
  ServiceStatus 
} from "../services/interfaces"

/**
 * Worker service options for Effect-based workers
 */
export interface EffectWorkerOptions {
  readonly workerURL: string | URL
  readonly workerOptions?: WorkerOptions
  readonly workerData?: unknown
  readonly autoTerminate?: boolean
  readonly terminateTimeout?: Duration.Duration
}

/**
 * Effect-based worker service implementation
 */
export class EffectWorkerService implements IEffectService {
  readonly name: string
  
  private readonly options: EffectWorkerOptions
  private readonly worker: Ref.Ref<NodeWorker | null>
  private readonly io: Ref.Ref<DestroyableIoInterface | null>
  private readonly rpc: Ref.Ref<RPCChannel<object, IEffectService, DestroyableIoInterface> | null>
  private readonly api: Ref.Ref<IEffectService | null>
  private readonly status: Ref.Ref<ServiceStatus>
  private readonly terminateTimer: Ref.Ref<Fiber.Fiber<void, never> | null>

  constructor(name: string, options: EffectWorkerOptions) {
    this.name = name
    this.options = options
    this.worker = Ref.unsafeMake<NodeWorker | null>(null)
    this.io = Ref.unsafeMake<DestroyableIoInterface | null>(null)
    this.rpc = Ref.unsafeMake<RPCChannel<object, IEffectService, DestroyableIoInterface> | null>(null)
    this.api = Ref.unsafeMake<IEffectService | null>(null)
    this.status = Ref.unsafeMake<ServiceStatus>("stopped")
    this.terminateTimer = Ref.unsafeMake<Fiber.Fiber<void, never> | null>(null)
  }

  readonly start: Effect.Effect<void, ServiceError, never> = Effect.gen(this, function* () {
    yield* this.cleanup()
    
    try {
      yield* Ref.set(this.status, "running")
      yield* Console.log(`Starting Effect worker service '${this.name}'`)

      // Initialize worker with proper error handling
      yield* this.initWorker()
      
      const api = yield* Ref.get(this.api)
      if (!api) {
        return yield* Effect.fail(new ServiceError(`Failed to initialize worker for ${this.name}`, this.name))
      }

      // Start the worker service
      yield* api.start.pipe(
        Effect.catchAll((error) => Effect.fail(new ServiceError(
          `Worker service start failed: ${String(error)}`,
          this.name,
          error
        )))
      )

      // Handle auto-termination
      if (this.options.autoTerminate) {
        const timeout = this.options.terminateTimeout || Duration.seconds(30)
        
        const terminateFiber = yield* Effect.fork(
          Effect.delay(
            this.autoTerminateWorker(),
            timeout
          )
        )
        
        yield* Ref.set(this.terminateTimer, terminateFiber)
      }

    } catch (error) {
      yield* Ref.set(this.status, "crashed")
      yield* this.cleanup()
      return yield* Effect.fail(new ServiceError(
        `Error starting worker service ${this.name}: ${String(error)}`,
        this.name,
        error
      ))
    }
  })

  readonly stop: Effect.Effect<void, ServiceError, never> = Effect.gen(this, function* () {
    const currentStatus = yield* Ref.get(this.status)
    if (currentStatus === "stopped") return

    yield* Ref.set(this.status, "stopping")
    yield* Console.log(`Stopping Effect worker service '${this.name}'`)

    // Cancel auto-termination timer
    const timer = yield* Ref.get(this.terminateTimer)
    if (timer) {
      yield* Fiber.interrupt(timer)
      yield* Ref.set(this.terminateTimer, null)
    }

    try {
      // Try graceful stop first
      const api = yield* Ref.get(this.api)
      if (api) {
        yield* api.stop.pipe(
          Effect.timeout("5 seconds"),
          Effect.catchAll((error) => 
            Console.warn(`Graceful stop failed for '${this.name}', forcing termination:`, error)
          )
        )
      }

      yield* this.cleanup()
      yield* Ref.set(this.status, "stopped")

    } catch (error) {
      yield* Ref.set(this.status, "crashed")
      yield* this.cleanup()
      return yield* Effect.fail(new ServiceError(
        `Error stopping worker service ${this.name}: ${String(error)}`,
        this.name,
        error
      ))
    }
  })

  readonly healthCheck: Effect.Effect<HealthCheckResult, ServiceError, never> = Effect.gen(this, function* () {
    const status = yield* Ref.get(this.status)
    
    if (status === "running") {
      const api = yield* Ref.get(this.api)
      if (api) {
        try {
          const workerHealth = yield* api.healthCheck.pipe(
            Effect.timeout("2 seconds"),
            Effect.catchAll((error) => Effect.succeed({
              status: "unhealthy" as const,
              details: { error: String(error) },
              timestamp: new Date()
            }))
          )
          
          return {
            ...workerHealth,
            details: {
              ...workerHealth.details,
              isWorker: true,
              workerStatus: status
            }
          }
        } catch (error) {
          return {
            status: "unhealthy",
            details: { 
              isWorker: true, 
              error: String(error),
              workerStatus: status
            },
            timestamp: new Date()
          }
        }
      }
    }

    return {
      status,
      details: { 
        isWorker: true,
        workerStatus: status
      },
      timestamp: new Date()
    }
  })

  // Private helper methods

  private readonly initWorker = (): Effect.Effect<void, ServiceError, never> => Effect.gen(this, function* () {
    try {
      const workerOptions: WorkerOptions = {
        ...this.options.workerOptions,
        ...(this.options.workerData !== undefined
          ? { workerData: this.options.workerData }
          : {})
      }

      const worker = new NodeWorker(this.options.workerURL.toString(), workerOptions)
      yield* Ref.set(this.worker, worker)

      const io = new WorkerParentIO(worker as any)
      yield* Ref.set(this.io, io)

      const rpc = new RPCChannel<object, IEffectService, DestroyableIoInterface>(io, {})
      yield* Ref.set(this.rpc, rpc)

      const api = rpc.getAPI()
      yield* Ref.set(this.api, api)

      // Set up error handlers
      yield* this.setupWorkerHandlers(worker)

    } catch (error) {
      yield* Ref.set(this.status, "crashed")
      return yield* Effect.fail(new ServiceError(
        `Error initializing worker for ${this.name}: ${String(error)}`,
        this.name,
        error
      ))
    }
  })

  private readonly setupWorkerHandlers = (worker: NodeWorker): Effect.Effect<void, never, never> => Effect.gen(this, function* () {
    yield* Effect.async<void, never, never>((resume) => {
      worker.addListener("error", (error) => {
        Console.runSync(Console.error(`Worker error event for ${this.name}:`, error))
        Ref.unsafeSet(this.status, "crashed")
        resume(Effect.void)
      })

      worker.addListener("messageerror", (error) => {
        Console.runSync(Console.error(`Worker message error for ${this.name}:`, error))  
        Ref.unsafeSet(this.status, "unhealthy")
        resume(Effect.void)
      })

      worker.addListener("exit", (code) => {
        if (code !== 0) {
          Console.runSync(Console.error(`Worker ${this.name} exited with code ${code}`))
          Ref.unsafeSet(this.status, "crashed")
        } else {
          Ref.unsafeSet(this.status, "stopped")
        }
        resume(Effect.void)
      })

      // Don't block - this just sets up listeners
      resume(Effect.void)
    })
  })

  private readonly cleanup = (): Effect.Effect<void, never, never> => Effect.gen(this, function* () {
    // Clean up terminate timer
    const timer = yield* Ref.get(this.terminateTimer)
    if (timer) {
      yield* Fiber.interrupt(timer).pipe(Effect.ignore)
      yield* Ref.set(this.terminateTimer, null)
    }

    // Clean up IO
    const io = yield* Ref.get(this.io)
    if (io) {
      try {
        io.destroy()
      } catch (error) {
        yield* Console.warn(`Error destroying IO for ${this.name}:`, error)
      }
      yield* Ref.set(this.io, null)
    }

    // Terminate worker
    const worker = yield* Ref.get(this.worker)
    if (worker) {
      try {
        yield* Effect.tryPromise({
          try: () => worker.terminate(),
          catch: (error) => error
        }).pipe(Effect.ignore)
      } catch (error) {
        yield* Console.warn(`Error terminating worker for ${this.name}:`, error)
      }
      yield* Ref.set(this.worker, null)
    }

    // Reset refs
    yield* Ref.set(this.rpc, null)
    yield* Ref.set(this.api, null)
  })

  private readonly autoTerminateWorker = (): Effect.Effect<void, never, never> => Effect.gen(this, function* () {
    yield* Console.log(`Auto-terminating worker service '${this.name}'`)
    yield* Ref.set(this.status, "stopping")
    yield* this.cleanup()
    yield* Ref.set(this.status, "stopped")
  })
}

/**
 * Helper function to create Effect worker services
 */
export const createEffectWorkerService = (
  name: string,
  workerURL: string | URL,
  options: Omit<EffectWorkerOptions, 'workerURL'> = {}
): IEffectService => {
  return new EffectWorkerService(name, {
    workerURL,
    ...options
  })
}
