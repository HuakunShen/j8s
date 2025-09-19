import type { RetryConfig, AnyServiceError } from "./types";
import { Effect, Schedule } from "effect";

/**
 * Creates a retry schedule based on configuration
 */
export function createRetrySchedule(
  config: RetryConfig
): Schedule.Schedule<number, AnyServiceError> {
  const {
    maxRetries = 3,
    schedule = "exponential",
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true
  } = config;

  // Base schedule based on type
  let baseSchedule: Schedule.Schedule<number>;
  
  switch (schedule) {
    case "fixed":
      baseSchedule = Schedule.spaced(baseDelay);
      break;
    case "linear":
      baseSchedule = Schedule.linear(baseDelay);
      break;
    case "exponential":
    default:
      baseSchedule = Schedule.exponential(baseDelay);
      break;
  }

  // Apply max delay cap
  if (maxDelay > 0) {
    baseSchedule = baseSchedule.pipe(
      Schedule.whileOutput((delay) => delay <= maxDelay)
    );
  }

  // Apply jitter if enabled
  if (jitter) {
    baseSchedule = baseSchedule.pipe(
      Schedule.jittered
    );
  }

  // Limit number of retries
  return baseSchedule.pipe(
    Schedule.compose(Schedule.recurs(maxRetries))
  );
}

/**
 * Creates a rate limiting schedule
 */
export function createRateLimitSchedule(config: RetryConfig): Schedule.Schedule<number> {
  const { rateLimit } = config;
  if (!rateLimit) {
    return Schedule.forever;
  }

  return Schedule.spaced(rateLimit.window / rateLimit.maxAttempts).pipe(
    Schedule.compose(Schedule.recurs(rateLimit.maxAttempts))
  );
}

/**
 * Combines retry and rate limiting schedules
 */
export function createRetryWithRateLimitSchedule(config: RetryConfig): Schedule.Schedule<number> {
  const retrySchedule = createRetrySchedule(config);
  const rateLimitSchedule = createRateLimitSchedule(config);
  
  return Schedule.union(retrySchedule, rateLimitSchedule);
}

/**
 * Retries an effect with configured retry policy
 */
export function retryWithConfig<T>(
  effect: Effect.Effect<T, AnyServiceError>,
  config: RetryConfig
): Effect.Effect<T, AnyServiceError> {
  const schedule = createRetryWithRateLimitSchedule(config);
  return Effect.retry(effect, schedule);
}

/**
 * Simple retry with exponential backoff
 */
export function retryExponential<T>(
  effect: Effect.Effect<T, AnyServiceError>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Effect.Effect<T, AnyServiceError> {
  const schedule = Schedule.exponential(baseDelay).pipe(
    Schedule.compose(Schedule.recurs(maxRetries))
  );
  return Effect.retry(effect, schedule);
}
