import { Effect } from "effect"
import type { IEffectService, ServiceError, HealthCheckResult } from "./interfaces"

/**
 * Abstract base class for Effect-based services
 * Provides default implementations and resource safety
 */
export abstract class BaseEffectService implements IEffectService {
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  /**
   * Abstract start method - must be implemented by subclasses
   */
  abstract readonly start: Effect.Effect<void, ServiceError, never>

  /**
   * Abstract stop method - must be implemented by subclasses  
   */
  abstract readonly stop: Effect.Effect<void, ServiceError, never>

  /**
   * Default health check implementation
   * Can be overridden by subclasses for custom health checks
   */
  readonly healthCheck: Effect.Effect<HealthCheckResult, ServiceError, never> = Effect.try({
    try: () => ({
      status: "running" as const,
      details: {
        service: this.name,
        type: "BaseEffectService"
      },
      timestamp: new Date()
    }),
    catch: (error) => new ServiceError(
      `Health check failed: ${String(error)}`,
      this.name,
      error
    )
  })

  /**
   * Helper method to create a simple service that runs a function
   */
  static create(
    name: string,
    startFn: () => Effect.Effect<void, ServiceError, never>,
    stopFn?: () => Effect.Effect<void, ServiceError, never>
  ): IEffectService {
    return new (class extends BaseEffectService {
      readonly start = startFn()
      readonly stop = stopFn?.() ?? Effect.void
    })(name)
  }

  /**
   * Helper method to wrap a Promise-based service into Effect
   */
  static fromPromise(
    name: string,
    startFn: () => Promise<void>,
    stopFn?: () => Promise<void>
  ): IEffectService {
    return new (class extends BaseEffectService {
      readonly start = Effect.tryPromise({
        try: startFn,
        catch: (error) => new ServiceError(
          `Service start failed: ${String(error)}`,
          name,
          error
        )
      })

      readonly stop = stopFn 
        ? Effect.tryPromise({
            try: stopFn,
            catch: (error) => new ServiceError(
              `Service stop failed: ${String(error)}`,
              name,
              error
            )
          })
        : Effect.void
    })(name)
  }
}
