import { Effect, Schedule, Fiber, Option, Console } from "effect";
import { StructuredServiceError } from "./errors";
import { ServiceErrorType } from "./errors";

/**
 * Retry policies for service operations
 */
export const RetryPolicies = {
  exponentialBackoff: (maxRetries: number = 3) =>
    Schedule.exponential(1000).pipe(
      Schedule.compose(Schedule.recurs(maxRetries)),
      Schedule.addDelay(() => Math.random() * 100) // Add jitter
    ),

  fixedDelay: (delay: number, maxRetries: number = 3) =>
    Schedule.spaced(delay).pipe(Schedule.compose(Schedule.recurs(maxRetries))),

  progressiveBackoff: (maxRetries: number = 5) =>
    Schedule.exponential(1000).pipe(
      Schedule.compose(Schedule.recurs(maxRetries)),
      Schedule.compose(Schedule.elapsed)
    ),
};

/**
 * Resource management utilities
 */
export const ResourceManager = {
  managedService: <A, E, R>(
    acquire: Effect.Effect<A, E, R>,
    release: (a: A) => Effect.Effect<void, never, R>,
    serviceName: string
  ): Effect.Effect<A, E, R> => {
    return Effect.scoped(
      Effect.acquireRelease(acquire, (a) => release(a)).pipe(
        Effect.annotateLogs({ serviceName })
      )
    );
  },

  withTimeout: <A, E>(
    effect: Effect.Effect<A, E>,
    duration: number,
    serviceName: string,
    operation: string
  ): Effect.Effect<A, E | StructuredServiceError> => {
    return Effect.timeoutFail(effect, {
      duration,
      onTimeout: () =>
        new StructuredServiceError(
          ServiceErrorType.TIMEOUT,
          serviceName,
          operation,
          `Operation timed out after ${duration}ms`
        ),
    });
  },
};

/**
 * Concurrency control utilities
 */
export const Concurrency = {
  withConcurrency: <A, E, R>(
    effects: Array<Effect.Effect<A, E, R>>,
    concurrency: number
  ): Effect.Effect<Array<A>, E, R> => {
    return Effect.all(effects, { concurrency });
  },

  semaphore: (maxPermits: number) => {
    return Effect.makeSemaphore(maxPermits);
  },
};

/**
 * Performance monitoring utilities
 */
export const Monitoring = {
  measureDuration: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    serviceName: string,
    operation: string
  ): Effect.Effect<A, E, R> => {
    return Effect.gen(function* () {
      const startTime = Date.now();
      const result = yield* effect;
      const endTime = Date.now();
      const duration = endTime - startTime;

      yield* Console.log(
        `[${serviceName}.${operation}] Completed in ${duration}ms`
      );

      return result;
    }).pipe(
      Effect.annotateLogs({
        serviceName,
        operation,
        metrics: { duration: Date.now() },
      })
    );
  },

  trackMetrics: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    serviceName: string,
    operation: string
  ): Effect.Effect<A, E, R> => {
    return effect.pipe(
      Effect.annotateLogs({
        serviceName,
        operation,
        tracked: true,
      })
    );
  },
};
