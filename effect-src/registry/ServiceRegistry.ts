import { 
  Effect, 
  Context, 
  Ref, 
  Console, 
  Fiber,
  Schedule,
  Duration
} from "effect"
import type {
  IEffectService,
  IServiceRegistry,
  ServiceConfig,
  ServiceError,
  ServiceNotFoundError,
  ServiceAlreadyExistsError,
  HealthCheckError,
  HealthCheckResult,
  ServiceStatus
} from "../services/interfaces"
import { RetryStrategies } from "../resilience/retry"
import { runOnSchedule } from "../scheduling/cron"

/**
 * Internal service entry with Effect-based state management
 */
interface ServiceEntry {
  readonly service: IEffectService
  readonly config: ServiceConfig
  readonly status: Ref.Ref<ServiceStatus>
  readonly restartCount: Ref.Ref<number>
  readonly runningFiber: Ref.Ref<Fiber.Fiber<void, ServiceError> | null>
  readonly cronFiber: Ref.Ref<Fiber.Fiber<never, ServiceError> | null>
}

/**
 * Effect-based service registry implementation
 */
class ServiceRegistryImpl implements IServiceRegistry {
  constructor(
    private readonly services: Ref.Ref<Map<string, ServiceEntry>>
  ) {}

  readonly addService = (
    service: IEffectService, 
    config: ServiceConfig = {}
  ): Effect.Effect<void, ServiceAlreadyExistsError, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services)
      
      if (servicesMap.has(service.name)) {
        return yield* Effect.fail(new ServiceAlreadyExistsError(service.name))
      }

      const entry: ServiceEntry = {
        service,
        config,
        status: yield* Ref.make<ServiceStatus>("stopped"),
        restartCount: yield* Ref.make(0),
        runningFiber: yield* Ref.make<Fiber.Fiber<void, ServiceError> | null>(null),
        cronFiber: yield* Ref.make<Fiber.Fiber<never, ServiceError> | null>(null)
      }

      const newMap = new Map(servicesMap).set(service.name, entry)
      yield* Ref.set(this.services, newMap)

      // Setup cron job if configured
      if (config.cronJob) {
        yield* this.setupCronJob(entry)
      }

      yield* Console.log(`Service '${service.name}' added to registry`)
    })

  readonly removeService = (serviceName: string): Effect.Effect<void, ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const entry = yield* this.getEntry(serviceName)
      
      // Stop the service first
      yield* this.stopService(serviceName).pipe(
        Effect.catchAll(() => Effect.void) // Continue even if stop fails
      )

      // Clean up fibers
      const runningFiber = yield* Ref.get(entry.runningFiber)
      if (runningFiber) {
        yield* Fiber.interrupt(runningFiber)
      }

      const cronFiber = yield* Ref.get(entry.cronFiber)  
      if (cronFiber) {
        yield* Fiber.interrupt(cronFiber)
      }

      // Remove from registry
      const servicesMap = yield* Ref.get(this.services)
      const newMap = new Map(servicesMap)
      newMap.delete(serviceName)
      yield* Ref.set(this.services, newMap)

      yield* Console.log(`Service '${serviceName}' removed from registry`)
    })

  readonly getService = (serviceName: string): Effect.Effect<IEffectService, ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const entry = yield* this.getEntry(serviceName)
      return entry.service
    })

  readonly getAllServices = Effect.gen(this, function* () {
    const servicesMap = yield* Ref.get(this.services)
    return Array.from(servicesMap.values()).map(entry => entry.service)
  })

  readonly startService = (serviceName: string): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const entry = yield* this.getEntry(serviceName)
      
      // Clear any existing running fiber
      const existingFiber = yield* Ref.get(entry.runningFiber)
      if (existingFiber) {
        yield* Fiber.interrupt(existingFiber)
        yield* Ref.set(entry.runningFiber, null)
      }

      yield* Ref.set(entry.status, "running")
      yield* Console.log(`Starting service '${serviceName}'`)

      // Apply retry policy based on configuration
      const serviceEffect = entry.config.retrySchedule
        ? Effect.retry(entry.service.start, { schedule: entry.config.retrySchedule })
        : entry.config.restartPolicy
        ? RetryStrategies.forRestartPolicy(
            entry.service.start,
            entry.config.restartPolicy,
            entry.config.maxRetries,
            serviceName
          )
        : entry.service.start

      // Fork the service to run in background
      const fiber = yield* Effect.fork(
        serviceEffect.pipe(
          Effect.tapBoth({
            onFailure: (error) => Effect.gen(this, function* () {
              yield* Ref.set(entry.status, "crashed")
              yield* Console.error(`Service '${serviceName}' failed:`, error)
              
              // Handle restart based on policy
              if (entry.config.restartPolicy !== "no") {
                yield* this.scheduleRestart(entry)
              }
            }),
            onSuccess: () => Effect.gen(this, function* () {
              yield* Ref.set(entry.status, "stopped") 
              yield* Ref.set(entry.restartCount, 0)
              yield* Console.log(`Service '${serviceName}' completed successfully`)
            })
          })
        )
      )

      yield* Ref.set(entry.runningFiber, fiber)

      // Wait briefly to catch immediate startup errors
      yield* Effect.sleep("100 millis")
      
      const status = yield* Ref.get(entry.status)
      if (status === "crashed") {
        return yield* Effect.fail(new ServiceError(`Service '${serviceName}' failed to start`, serviceName))
      }

      yield* Ref.set(entry.restartCount, 0)
    }).pipe(
      Effect.catchTag("ServiceNotFoundError", (error) => Effect.fail(error))
    )

  readonly stopService = (serviceName: string): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const entry = yield* this.getEntry(serviceName)
      
      yield* Ref.set(entry.status, "stopping")
      yield* Console.log(`Stopping service '${serviceName}'`)

      // Stop cron job if running
      const cronFiber = yield* Ref.get(entry.cronFiber)
      if (cronFiber) {
        yield* Fiber.interrupt(cronFiber)
        yield* Ref.set(entry.cronFiber, null)
      }

      // Stop the service with timeout
      const stopWithTimeout = entry.service.stop.pipe(
        Effect.timeout("10 seconds"),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(new ServiceError("Service stop timeout", serviceName))
        )
      )

      yield* stopWithTimeout
      yield* Ref.set(entry.status, "stopped")
      yield* Ref.set(entry.restartCount, 0)

      // Clean up running fiber
      const runningFiber = yield* Ref.get(entry.runningFiber) 
      if (runningFiber) {
        yield* Fiber.interrupt(runningFiber)
        yield* Ref.set(entry.runningFiber, null)
      }
    }).pipe(
      Effect.catchTag("ServiceNotFoundError", (error) => Effect.fail(error)),
      Effect.catchAll((error) => Effect.fail(new ServiceError(
        `Error stopping service '${serviceName}': ${error}`,
        serviceName,
        error
      )))
    )

  readonly restartService = (serviceName: string): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      yield* this.stopService(serviceName)
      yield* this.startService(serviceName)
    })

  readonly healthCheckService = (
    serviceName: string
  ): Effect.Effect<HealthCheckResult, HealthCheckError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const entry = yield* this.getEntry(serviceName)
      const status = yield* Ref.get(entry.status)
      
      const serviceHealth = yield* entry.service.healthCheck.pipe(
        Effect.catchAll((error) => Effect.succeed({
          status: "unhealthy" as const,
          details: { error: String(error) },
          timestamp: new Date()
        }))
      )

      // Override with our managed status
      return {
        ...serviceHealth,
        status, // Use our tracked status
        details: {
          ...serviceHealth.details,
          managedStatus: status,
          restartCount: yield* Ref.get(entry.restartCount)
        }
      }
    }).pipe(
      Effect.catchTag("ServiceNotFoundError", (error) => 
        Effect.fail(new HealthCheckError(serviceName, error))
      )
    )

  readonly startAllServices = Effect.gen(this, function* () {
    const services = yield* this.getAllServices
    
    yield* Effect.forEach(
      services,
      (service) => this.startService(service.name).pipe(
        Effect.catchAll((error) => 
          Console.error(`Failed to start service '${service.name}':`, error)
        )
      ),
      { concurrency: "unbounded" }
    )
  })

  readonly stopAllServices = Effect.gen(this, function* () {
    const services = yield* this.getAllServices
    
    yield* Effect.forEach(
      services,
      (service) => this.stopService(service.name).pipe(
        Effect.catchAll((error) =>
          Console.error(`Failed to stop service '${service.name}':`, error)
        )
      ),
      { concurrency: "unbounded" }
    )
  })

  readonly healthCheckAllServices = Effect.gen(this, function* () {
    const services = yield* this.getAllServices
    
    const healthChecks = yield* Effect.forEach(
      services,
      (service) => this.healthCheckService(service.name).pipe(
        Effect.catchAll(() => Effect.succeed({
          status: "unhealthy" as const,
          details: { error: "Health check failed" },
          timestamp: new Date()
        } as HealthCheckResult)),
        Effect.map((health) => [service.name, health] as const)
      ),
      { concurrency: "unbounded" }
    )

    return Object.fromEntries(healthChecks)
  })

  // Private helper methods
  
  private readonly getEntry = (serviceName: string): Effect.Effect<ServiceEntry, ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services)
      const entry = servicesMap.get(serviceName)
      
      if (!entry) {
        return yield* Effect.fail(new ServiceNotFoundError(serviceName))
      }
      
      return entry
    })

  private readonly setupCronJob = (entry: ServiceEntry): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      if (!entry.config.cronJob) return

      const { cron, timeout } = entry.config.cronJob
      
      const cronTask = timeout
        ? Effect.timeout(entry.service.start, timeout)
        : entry.service.start

      const cronEffect = runOnSchedule(
        cron,
        cronTask.pipe(
          Effect.tapBoth({
            onFailure: (error) => Effect.gen(this, function* () {
              yield* Ref.set(entry.status, "crashed")
              yield* Console.error(`Cron job failed for '${entry.service.name}':`, error)
            }),
            onSuccess: () => Effect.gen(this, function* () {
              yield* Ref.set(entry.status, "stopped")
              yield* Console.log(`Cron job completed for '${entry.service.name}'`)
            })
          })
        ),
        timeout
      )

      const fiber = yield* Effect.fork(cronEffect)
      yield* Ref.set(entry.cronFiber, fiber)
    })

  private readonly scheduleRestart = (entry: ServiceEntry): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const restartCount = yield* Ref.get(entry.restartCount)
      const policy = entry.config.restartPolicy || "on-failure"
      const maxRetries = entry.config.maxRetries || 3

      if (policy === "on-failure" && restartCount >= maxRetries) {
        yield* Console.error(
          `Service '${entry.service.name}' exceeded max restart attempts (${maxRetries})`
        )
        return
      }

      yield* Ref.update(entry.restartCount, (count) => count + 1)

      const delay = Math.min(1000 * Math.pow(2, restartCount), 30000)
      yield* Console.log(
        `Scheduling restart for service '${entry.service.name}' in ${delay}ms (attempt ${restartCount + 1})`
      )

      yield* Effect.sleep(`${delay} millis`)
      yield* this.startService(entry.service.name).pipe(
        Effect.catchAll((error) =>
          Console.error(`Restart failed for '${entry.service.name}':`, error)
        )
      )
    })
}

/**
 * Create a new service registry
 */
export const makeServiceRegistry = (): Effect.Effect<IServiceRegistry, never, never> =>
  Effect.gen(function* () {
    const services = yield* Ref.make(new Map<string, ServiceEntry>())
    return new ServiceRegistryImpl(services)
  })

/**
 * Service registry layer for Effect's dependency injection
 */
export const ServiceRegistryLive = Context.Layer.effect(
  ServiceRegistry,
  makeServiceRegistry()
)
