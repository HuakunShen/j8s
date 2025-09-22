import { Effect, Context, Console, Duration } from "effect"
import type {
  IEffectService,
  ServiceConfig,
  IServiceRegistry,
  ServiceError,
  ServiceNotFoundError,
  ServiceAlreadyExistsError,
  HealthCheckError,
  HealthCheckResult
} from "../services/interfaces"
import type { IHealthMonitor } from "../health/monitor"
import { ServiceRegistry, ServiceRegistryLive } from "../registry/ServiceRegistry"
import { HealthMonitor, HealthMonitorLive } from "../health/monitor"

/**
 * Main Effect-based service manager
 * This replaces the original ServiceManager with Effect's powerful features
 */
export interface IEffectServiceManager {
  readonly addService: (
    service: IEffectService, 
    config?: ServiceConfig
  ) => Effect.Effect<void, ServiceAlreadyExistsError, never>
  
  readonly removeService: (
    serviceName: string
  ) => Effect.Effect<void, ServiceNotFoundError, never>
  
  readonly startService: (
    serviceName: string
  ) => Effect.Effect<void, ServiceError | ServiceNotFoundError, never>
  
  readonly stopService: (
    serviceName: string
  ) => Effect.Effect<void, ServiceError | ServiceNotFoundError, never>
  
  readonly restartService: (
    serviceName: string
  ) => Effect.Effect<void, ServiceError | ServiceNotFoundError, never>
  
  readonly healthCheckService: (
    serviceName: string
  ) => Effect.Effect<HealthCheckResult, HealthCheckError | ServiceNotFoundError, never>
  
  readonly startAllServices: Effect.Effect<void, ServiceError, never>
  readonly stopAllServices: Effect.Effect<void, ServiceError, never>
  readonly healthCheckAllServices: Effect.Effect<Record<string, HealthCheckResult>, never, never>
  
  readonly getAllServices: Effect.Effect<ReadonlyArray<IEffectService>, never, never>
  readonly getServiceCount: Effect.Effect<number, never, never>
  
  readonly startHealthMonitoring: Effect.Effect<void, never, never>
  readonly stopHealthMonitoring: Effect.Effect<void, never, never>
  readonly getOverallHealth: Effect.Effect<import("../health/monitor").OverallHealth, never, never>
}

/**
 * Effect service manager implementation
 */
class EffectServiceManagerImpl implements IEffectServiceManager {
  constructor(
    private readonly registry: IServiceRegistry,
    private readonly healthMonitor: IHealthMonitor
  ) {}

  readonly addService = (
    service: IEffectService,
    config: ServiceConfig = {}
  ): Effect.Effect<void, ServiceAlreadyExistsError, never> =>
    Effect.gen(this, function* () {
      yield* this.registry.addService(service, config)
      yield* Console.log(`Added service '${service.name}' to Effect service manager`)
    })

  readonly removeService = (serviceName: string): Effect.Effect<void, ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      yield* this.registry.removeService(serviceName)
      yield* Console.log(`Removed service '${serviceName}' from Effect service manager`)
    })

  readonly startService = (
    serviceName: string
  ): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      yield* Console.log(`Starting service '${serviceName}' via Effect service manager`)
      yield* this.registry.startService(serviceName)
    })

  readonly stopService = (
    serviceName: string
  ): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      yield* Console.log(`Stopping service '${serviceName}' via Effect service manager`)
      yield* this.registry.stopService(serviceName)
    })

  readonly restartService = (
    serviceName: string
  ): Effect.Effect<void, ServiceError | ServiceNotFoundError, never> =>
    Effect.gen(this, function* () {
      yield* Console.log(`Restarting service '${serviceName}' via Effect service manager`)
      yield* this.registry.restartService(serviceName)
    })

  readonly healthCheckService = (
    serviceName: string
  ): Effect.Effect<HealthCheckResult, HealthCheckError | ServiceNotFoundError, never> =>
    this.registry.healthCheckService(serviceName)

  readonly startAllServices = Effect.gen(this, function* () {
    yield* Console.log("Starting all services via Effect service manager")
    yield* this.registry.startAllServices
  })

  readonly stopAllServices = Effect.gen(this, function* () {
    yield* Console.log("Stopping all services via Effect service manager")
    yield* this.registry.stopAllServices
  })

  readonly healthCheckAllServices = this.registry.healthCheckAllServices

  readonly getAllServices = this.registry.getAllServices
  
  readonly getServiceCount = Effect.gen(this, function* () {
    const services = yield* this.getAllServices
    return services.length
  })

  readonly startHealthMonitoring = Effect.gen(this, function* () {
    yield* Console.log("Starting health monitoring")
    yield* this.healthMonitor.start
  })

  readonly stopHealthMonitoring = Effect.gen(this, function* () {
    yield* Console.log("Stopping health monitoring") 
    yield* this.healthMonitor.stop
  })

  readonly getOverallHealth = this.healthMonitor.getOverallHealth
}

/**
 * Create an Effect service manager
 */
export const makeEffectServiceManager = (): Effect.Effect<
  IEffectServiceManager,
  never,
  IServiceRegistry | IHealthMonitor
> =>
  Effect.gen(function* () {
    const registry = yield* Effect.service(IServiceRegistry)
    const healthMonitor = yield* Effect.service(IHealthMonitor)
    
    return new EffectServiceManagerImpl(registry, healthMonitor)
  })

/**
 * Effect service manager context tag
 */
export const EffectServiceManager = Context.GenericTag<IEffectServiceManager>("EffectServiceManager")

/**
 * Effect service manager layer with all dependencies
 */
export const EffectServiceManagerLive = Context.Layer.effect(
  EffectServiceManager,
  makeEffectServiceManager()
).pipe(
  Context.Layer.provide(ServiceRegistryLive),
  Context.Layer.provide(HealthMonitorLive)
)

/**
 * Convenience functions for common operations
 */
export const EffectServiceManagerOperations = {
  /**
   * Run a complete service management session
   */
  runWithManager: <A, E, R>(
    effect: Effect.Effect<A, E, R | IEffectServiceManager>
  ) => Effect.runPromise(
    Effect.provide(effect, EffectServiceManagerLive)
  ),

  /**
   * Add multiple services at once
   */
  addServices: (
    services: Array<{ service: IEffectService; config?: ServiceConfig }>
  ): Effect.Effect<void, ServiceAlreadyExistsError, IEffectServiceManager> =>
    Effect.gen(function* () {
      const manager = yield* Effect.service(IEffectServiceManager)
      
      yield* Effect.forEach(
        services,
        ({ service, config }) => manager.addService(service, config),
        { concurrency: "unbounded" }
      )
    }),

  /**
   * Start services with dependencies in order
   */
  startServicesInOrder: (
    serviceNames: string[]
  ): Effect.Effect<void, ServiceError | ServiceNotFoundError, IEffectServiceManager> =>
    Effect.gen(function* () {
      const manager = yield* Effect.service(IEffectServiceManager)
      
      for (const serviceName of serviceNames) {
        yield* manager.startService(serviceName)
        // Wait a bit between starts to ensure proper ordering
        yield* Effect.sleep(Duration.millis(100))
      }
    }),

  /**
   * Graceful shutdown of all services
   */
  gracefulShutdown: (
    timeoutMs: number = 30000
  ): Effect.Effect<void, never, IEffectServiceManager> =>
    Effect.gen(function* () {
      const manager = yield* Effect.service(IEffectServiceManager)
      
      yield* Console.log("Initiating graceful shutdown...")
      
      // Stop health monitoring first
      yield* manager.stopHealthMonitoring.pipe(Effect.ignore)
      
      // Stop all services with timeout
      yield* manager.stopAllServices.pipe(
        Effect.timeout(Duration.millis(timeoutMs)),
        Effect.catchAll((error) => 
          Console.error("Graceful shutdown failed, forcing termination:", error)
        )
      )
      
      yield* Console.log("Graceful shutdown completed")
    }),

  /**
   * Wait for all services to be healthy
   */
  waitForHealthy: (
    timeoutMs: number = 60000,
    checkIntervalMs: number = 1000
  ): Effect.Effect<void, never, IEffectServiceManager> =>
    Effect.gen(function* () {
      const manager = yield* Effect.service(IEffectServiceManager)
      
      const checkHealth = Effect.gen(function* () {
        const health = yield* manager.getOverallHealth
        
        if (health.status === "healthy") {
          yield* Console.log("All services are healthy!")
          return true
        }
        
        yield* Console.log(`Waiting for services to be healthy... Status: ${health.status}`)
        yield* Console.log(`Healthy: ${health.summary.healthy}, Unhealthy: ${health.summary.unhealthy}`)
        return false
      })
      
      yield* Effect.repeat(
        checkHealth,
        {
          while: (healthy) => !healthy,
          schedule: {
            delay: Duration.millis(checkIntervalMs)
          }
        }
      ).pipe(
        Effect.timeout(Duration.millis(timeoutMs)),
        Effect.catchTag("TimeoutError", () => 
          Console.warn(`Timeout waiting for services to be healthy after ${timeoutMs}ms`)
        )
      )
    })
} as const
