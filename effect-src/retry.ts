import type { RetryConfig, AnyServiceError } from "./types";
import { Effect, Schedule } from "effect";

/**
 * Simple retry with exponential backoff
 */
export function retryExponential<T>(
  effect: Effect.Effect<T, AnyServiceError>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Effect.Effect<T, AnyServiceError> {
  const schedule = Schedule.recurs(maxRetries);
  return Effect.retry(effect, schedule);
}

/**
 * Simple retry with fixed interval
 */
export function retryFixed<T>(
  effect: Effect.Effect<T, AnyServiceError>,
  maxRetries: number = 3,
  delay: number = 1000
): Effect.Effect<T, AnyServiceError> {
  const schedule = Schedule.recurs(maxRetries);
  return Effect.retry(effect, schedule);
}

/**
 * Retries an effect with configured retry policy
 */
export function retryWithConfig<T>(
  effect: Effect.Effect<T, AnyServiceError>,
  config: RetryConfig
): Effect.Effect<T, AnyServiceError> {
  const { maxRetries = 3 } = config;
  const schedule = Schedule.recurs(maxRetries);
  return Effect.retry(effect, schedule);
}
