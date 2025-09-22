import {
  Effect,
  Schedule,
  Console,
  Ref,
  Fiber,
  Duration,
  Context,
  Metric,
  Array as EffectArray
} from "effect"
import type {
  IServiceRegistry,
  HealthCheckResult,
  ServiceStatus
} from "../services/interfaces"

/**
 * Health monitoring configuration
 */
export interface HealthMonitorConfig {
  readonly checkInterval: Duration.Duration
  readonly unhealthyThreshold: number
  readonly enableMetrics: boolean
  readonly enableAlerts: boolean
}

/**
 * Health alert types
 */
export type HealthAlert = {
  readonly type: "service_unhealthy" | "service_recovered" | "service_crashed"
  readonly serviceName: string
  readonly timestamp: Date
  readonly details: Record<string, unknown>
}

/**
 * Health monitor interface
 */
export interface IHealthMonitor {
  readonly start: Effect.Effect<void, never, never>
  readonly stop: Effect.Effect<void, never, never>  
  readonly getOverallHealth: Effect.Effect<OverallHealth, never, never>
  readonly getServiceHealth: (serviceName: string) => Effect.Effect<HealthCheckResult | null, never, never>
  readonly subscribeToAlerts: (
    callback: (alert: HealthAlert) => Effect.Effect<void, never, never>
  ) => Effect.Effect<void, never, never>
}

/**
 * Overall system health
 */
export interface OverallHealth {
  readonly status: "healthy" | "degraded" | "unhealthy"
  readonly services: Record<string, HealthCheckResult>
  readonly summary: {
    readonly total: number
    readonly healthy: number
    readonly unhealthy: number
    readonly stopped: number
    readonly crashed: number
  }
  readonly timestamp: Date
}

/**
 * Health metrics using Effect's Metric system
 */
const HealthMetrics = {
  serviceHealthChecks: Metric.counter("service_health_checks_total"),
  
  serviceUnhealthyCount: Metric.gauge("service_unhealthy_count"),
  
  healthCheckDuration: Metric.histogram("health_check_duration_ms"),
  
  serviceStatusChanges: Metric.counter("service_status_changes_total")
} as const

/**
 * Health monitor implementation
 */
class HealthMonitorImpl implements IHealthMonitor {
  constructor(
    private readonly registry: IServiceRegistry,
    private readonly config: HealthMonitorConfig,
    private readonly isRunning: Ref.Ref<boolean>,
    private readonly monitorFiber: Ref.Ref<Fiber.Fiber<any, any> | null>,
    private readonly healthCache: Ref.Ref<Map<string, HealthCheckResult>>,
    private readonly alertSubscribers: Ref.Ref<Array<(alert: HealthAlert) => Effect.Effect<void, never, never>>>
  ) {}

  readonly start = Effect.gen(this, function* () {
    const running = yield* Ref.get(this.isRunning)
    if (running) return

    yield* Ref.set(this.isRunning, true)
    yield* Console.log("Starting health monitor")

    const monitorLoop = Effect.repeat(
      this.performHealthChecks(),
      Schedule.fixed(this.config.checkInterval)
    )

    const fiber = yield* Effect.fork(monitorLoop)
    yield* Ref.set(this.monitorFiber, fiber)
  })

  readonly stop = Effect.gen(this, function* () {
    yield* Ref.set(this.isRunning, false)
    
    const fiber = yield* Ref.get(this.monitorFiber)
    if (fiber) {
      yield* Fiber.interrupt(fiber)
      yield* Ref.set(this.monitorFiber, null)
    }

    yield* Console.log("Health monitor stopped")
  })

  readonly getOverallHealth = Effect.gen(this, function* () {
    const healthMap = yield* Ref.get(this.healthCache)
    const services = Object.fromEntries(healthMap.entries())
    
    const summary = Array.from(healthMap.values()).reduce(
      (acc, health) => {
        acc.total++
        switch (health.status) {
          case "running":
            acc.healthy++
            break
          case "unhealthy":
            acc.unhealthy++
            break
          case "stopped":
            acc.stopped++
            break
          case "crashed":
            acc.crashed++
            break
        }
        return acc
      },
      { total: 0, healthy: 0, unhealthy: 0, stopped: 0, crashed: 0 }
    )

    const status: OverallHealth["status"] = summary.crashed > 0 || summary.unhealthy > summary.healthy
      ? "unhealthy"
      : summary.unhealthy > 0
      ? "degraded" 
      : "healthy"

    return {
      status,
      services,
      summary,
      timestamp: new Date()
    }
  })

  readonly getServiceHealth = (serviceName: string) => Effect.gen(this, function* () {
    const healthMap = yield* Ref.get(this.healthCache)
    return healthMap.get(serviceName) || null
  })

  readonly subscribeToAlerts = (
    callback: (alert: HealthAlert) => Effect.Effect<void, never, never>
  ) => Effect.gen(this, function* () {
    const subscribers = yield* Ref.get(this.alertSubscribers)
    yield* Ref.set(this.alertSubscribers, [...subscribers, callback])
  })

  // Private methods

  private readonly performHealthChecks = Effect.gen(this, function* () {
    const services = yield* this.registry.getAllServices
    const previousHealthMap = yield* Ref.get(this.healthCache)
    
    const healthChecks = yield* Effect.forEach(
      services,
      (service) => this.checkServiceHealth(service.name, previousHealthMap.get(service.name)),
      { concurrency: "unbounded" }
    )

    const newHealthMap = new Map(
      healthChecks.map(([serviceName, health]) => [serviceName, health])
    )
    
    yield* Ref.set(this.healthCache, newHealthMap)
    
    if (this.config.enableMetrics) {
      yield* this.updateMetrics(newHealthMap)
    }
  })

  private readonly checkServiceHealth = (
    serviceName: string,
    previousHealth?: HealthCheckResult
  ) => Effect.gen(this, function* () {
    const startTime = yield* Effect.sync(() => Date.now())
    
    const health = yield* this.registry.healthCheckService(serviceName).pipe(
      Effect.catchAll(() => Effect.succeed({
        status: "unhealthy" as const,
        details: { error: "Health check failed" },
        timestamp: new Date()
      } as HealthCheckResult))
    )

    const duration = yield* Effect.sync(() => Date.now() - startTime)
    
    if (this.config.enableMetrics) {
      yield* Effect.sync(() => {
        Metric.increment(HealthMetrics.serviceHealthChecks)
        Metric.update(HealthMetrics.healthCheckDuration, duration)
      }).pipe(Effect.ignore)
    }

    // Check for status changes and emit alerts
    if (this.config.enableAlerts && previousHealth && previousHealth.status !== health.status) {
      yield* this.emitAlert({
        type: this.getAlertType(previousHealth.status, health.status),
        serviceName,
        timestamp: new Date(),
        details: {
          previousStatus: previousHealth.status,
          newStatus: health.status,
          healthDetails: health.details
        }
      })

      if (this.config.enableMetrics) {
        yield* Effect.sync(() => Metric.increment(HealthMetrics.serviceStatusChanges)).pipe(Effect.ignore)
      }
    }

    return [serviceName, health] as const
  })

  private readonly updateMetrics = (healthMap: Map<string, HealthCheckResult>) =>
    Effect.sync(() => {
      const unhealthyCount = Array.from(healthMap.values()).filter(
        (health) => health.status === "unhealthy" || health.status === "crashed"
      ).length
      
      Metric.set(HealthMetrics.serviceUnhealthyCount, unhealthyCount)
    }).pipe(Effect.ignore)

  private readonly emitAlert = (alert: HealthAlert) => Effect.gen(this, function* () {
    yield* Console.log(`Health Alert: ${alert.type} for ${alert.serviceName}`)
    
    const subscribers = yield* Ref.get(this.alertSubscribers)
    
    yield* Effect.forEach(
      subscribers,
      (callback) => callback(alert).pipe(
        Effect.catchAll((error) => 
          Console.error("Alert subscriber error:", error)
        )
      ),
      { concurrency: "unbounded" }
    )
  })

  private readonly getAlertType = (
    previousStatus: ServiceStatus,
    newStatus: ServiceStatus
  ): HealthAlert["type"] => {
    if (newStatus === "crashed") return "service_crashed"
    if (previousStatus === "unhealthy" && newStatus === "running") return "service_recovered"
    if (newStatus === "unhealthy") return "service_unhealthy"
    return "service_unhealthy" // fallback
  }
}

/**
 * Create a health monitor
 */
export const makeHealthMonitor = (
  config: HealthMonitorConfig = {
    checkInterval: Duration.seconds(30),
    unhealthyThreshold: 3,
    enableMetrics: true,
    enableAlerts: true
  }
) => Effect.gen(function* () {
  const registry = yield* Context.Tag.Service(ServiceRegistry)()
  const isRunning = yield* Ref.make(false)
  const monitorFiber = yield* Ref.make<Fiber.Fiber<any, any> | null>(null)
  const healthCache = yield* Ref.make(new Map<string, HealthCheckResult>())
  const alertSubscribers = yield* Ref.make<Array<(alert: HealthAlert) => Effect.Effect<void, never, never>>>([])

  return new HealthMonitorImpl(
    registry,
    config,
    isRunning,
    monitorFiber,
    healthCache,
    alertSubscribers
  ) as IHealthMonitor
})

/**
 * Health monitor context tag
 */
export const HealthMonitor = Context.GenericTag<IHealthMonitor>("HealthMonitor")

/**
 * Health monitor layer
 */
export const HealthMonitorLive = Effect.succeed(makeHealthMonitor()).pipe(
  Effect.flatMap(identity => identity),
  Context.Tag.toLayer(HealthMonitor)
)
