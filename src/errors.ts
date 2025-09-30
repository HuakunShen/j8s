import { Effect, Schedule } from "effect";

/**
 * Error handling utilities for j8s services
 */

/**
 * Types of service errors
 */
export enum ServiceErrorType {
  STARTUP = "STARTUP",
  SHUTDOWN = "SHUTDOWN",
  HEALTH_CHECK = "HEALTH_CHECK",
  TIMEOUT = "TIMEOUT",
  RETRY_EXHAUSTED = "RETRY_EXHAUSTED",
  VALIDATION = "VALIDATION",
  UNKNOWN = "UNKNOWN",
}

/**
 * Structured error class for service operations
 */
export class StructuredServiceError {
  constructor(
    public readonly type: ServiceErrorType,
    public readonly serviceName: string,
    public readonly operation: string,
    public readonly message: string,
    public readonly cause?: Error,
    public readonly timestamp: Date = new Date(),
    public readonly context?: Record<string, any>
  ) {}

  toJSON() {
    return {
      type: this.type,
      serviceName: this.serviceName,
      operation: this.operation,
      message: this.message,
      cause: this.cause?.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
    };
  }

  toString(): string {
    return `StructuredServiceError[${this.type}][${this.serviceName}.${this.operation}]: ${this.message}`;
  }
}

/**
 * Error handling utilities
 */
export const ServiceErrorHandling = {
  toStructured: (
    type: ServiceErrorType,
    serviceName: string,
    operation: string,
    error: unknown
  ): StructuredServiceError => {
    return new StructuredServiceError(
      type,
      serviceName,
      operation,
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : undefined
    );
  },

  logError: (error: StructuredServiceError) => 
    Effect.logError(error.toString(), { error: error.toJSON() }),

  retryWithBackoff: <A, E>(
    effect: Effect.Effect<A, E>,
    serviceName: string,
    operation: string,
    maxRetries: number = 3
  ): Effect.Effect<A, E | StructuredServiceError> => {
    const retryPolicy = Schedule.exponential(1000).pipe(
      Schedule.compose(Schedule.recurs(maxRetries)),
      Schedule.addDelay(() => Math.random() * 100) // Add jitter
    );
    
    return Effect.retry(effect, retryPolicy).pipe(
      Effect.catchAll((error) => 
        Effect.fail(new StructuredServiceError(
          ServiceErrorType.RETRY_EXHAUSTED,
          serviceName,
          operation,
          `Retry exhausted: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        ))
      )
    );
  },
};