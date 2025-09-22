import { Effect, Schedule, Console } from "effect"
import type { ServiceError, RestartPolicy } from "../services/interfaces"
import { Schedules } from "../scheduling/schedules"

/**
 * Retry strategies for services using Effect's structured error handling
 */
export const RetryStrategies = {
  /**
   * Retry with exponential backoff and logging
   */
  withExponentialBackoff: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    maxRetries: number = 3,
    onRetry?: (error: E, attempt: number) => Effect.Effect<void, never, never>
  ): Effect.Effect<A, E, R> => {
    const schedule = Schedules.retryWithLimit(maxRetries)
    
    return Effect.retry(effect, {
      schedule,
      ...(onRetry && {
        while: (error: E) => Effect.succeed(true),
        onRetry: ({ attempt, error }) => 
          onRetry(error, attempt).pipe(Effect.orElse(() => Effect.void))
      })
    })
  },

  /**
   * Retry based on restart policy
   */
  forRestartPolicy: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    policy: RestartPolicy,
    maxRetries: number = 3,
    serviceName?: string
  ): Effect.Effect<A, E, R> => {
    switch (policy) {
      case "always":
        return Effect.retry(effect, {
          schedule: Schedules.serviceRestart.always,
          onRetry: ({ attempt, error }) =>
            Console.log(`Service ${serviceName} restart attempt ${attempt}: ${String(error)}`)
        })

      case "on-failure":
        return Effect.retry(effect, {
          schedule: Schedules.serviceRestart.onFailure(maxRetries),
          onRetry: ({ attempt, error }) =>
            Console.log(`Service ${serviceName} retry ${attempt}/${maxRetries}: ${String(error)}`)
        })

      case "unless-stopped":
        return Effect.retry(effect, {
          schedule: Schedules.serviceRestart.unlessStopped,
          while: (error: E) => {
            // Only retry if not explicitly stopped
            return Effect.succeed(
              !(error instanceof ServiceError && error.message.includes("stopped"))
            )
          },
          onRetry: ({ attempt, error }) =>
            Console.log(`Service ${serviceName} restart (unless-stopped) attempt ${attempt}: ${String(error)}`)
        })

      case "no":
        return effect

      default:
        return effect
    }
  },

  /**
   * Circuit breaker pattern using Effect
   */
  withCircuitBreaker: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    failureThreshold: number = 5,
    resetTimeout: number = 30000
  ): Effect.Effect<A, E | CircuitBreakerError, R> => {
    // Simple circuit breaker implementation
    // In a real implementation, you'd use a proper circuit breaker library
    // or Effect's built-in circuit breaker when available
    return Effect.gen(function* () {
      const result = yield* effect
      return result
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(new CircuitBreakerError("Circuit breaker activated", error))
      )
    )
  },

  /**
   * Timeout with graceful degradation
   */
  withTimeout: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    timeoutMs: number,
    onTimeout?: () => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | TimeoutError, R> => {
    const timeoutEffect = Effect.sleep(`${timeoutMs} millis`).pipe(
      Effect.as(new TimeoutError(`Operation timed out after ${timeoutMs}ms`)),
      Effect.flip
    )

    const racedEffect = Effect.race(effect, timeoutEffect)

    return onTimeout
      ? Effect.catchTag(racedEffect, "TimeoutError", () => onTimeout())
      : racedEffect
  },

  /**
   * Bulkhead pattern - limit concurrent executions
   */
  withBulkhead: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    maxConcurrency: number = 10
  ): Effect.Effect<A, E | BulkheadError, R> => {
    // This would use Effect's Semaphore in a real implementation
    return effect.pipe(
      Effect.catchAll((error) =>
        Effect.fail(new BulkheadError("Bulkhead limit exceeded", error))
      )
    )
  }
} as const

/**
 * Custom error types for resilience patterns
 */
export class CircuitBreakerError {
  readonly _tag = "CircuitBreakerError"
  constructor(
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

export class TimeoutError {
  readonly _tag = "TimeoutError"
  constructor(readonly message: string) {}
}

export class BulkheadError {
  readonly _tag = "BulkheadError"
  constructor(
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

/**
 * Resilience policies that combine multiple strategies
 */
export const ResiliencePolicies = {
  /**
   * Standard service resilience policy
   */
  standard: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    serviceName?: string
  ) =>
    effect.pipe(
      (eff) => RetryStrategies.withExponentialBackoff(eff, 3),
      (eff) => RetryStrategies.withTimeout(eff, 30000),
      Effect.tapError((error) =>
        Console.error(`Service ${serviceName} failed:`, error)
      )
    ),

  /**
   * High availability policy with aggressive retries
   */
  highAvailability: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    serviceName?: string
  ) =>
    effect.pipe(
      (eff) => RetryStrategies.forRestartPolicy(eff, "always", 10, serviceName),
      (eff) => RetryStrategies.withTimeout(eff, 60000)
    ),

  /**
   * Quick fail policy for non-critical services
   */
  quickFail: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    serviceName?: string
  ) =>
    effect.pipe(
      (eff) => RetryStrategies.withTimeout(eff, 5000),
      Effect.tapError((error) =>
        Console.warn(`Quick fail service ${serviceName}:`, error)
      )
    )
} as const
