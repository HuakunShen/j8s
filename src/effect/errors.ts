import { Data } from "effect";

/**
 * Base service error for all Effect-based service operations
 */
export class ServiceError extends Data.TaggedError("ServiceError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Service startup-related errors
 */
export class StartupError extends Data.TaggedError("StartupError")<{
  readonly message: string;
  readonly phase: "initialization" | "execution";
  readonly cause?: unknown;
}> {}

/**
 * Service shutdown-related errors  
 */
export class ShutdownError extends Data.TaggedError("ShutdownError")<{
  readonly message: string;
  readonly timeout: boolean;
  readonly cause?: unknown;
}> {}

/**
 * Health check-related errors
 */
export class HealthCheckError extends Data.TaggedError("HealthCheckError")<{
  readonly message: string;
  readonly lastSuccessful?: Date;
  readonly cause?: unknown;
}> {}

/**
 * Worker-specific errors
 */
export class WorkerError extends Data.TaggedError("WorkerError")<{
  readonly message: string;
  readonly workerId: string;
  readonly communicationFailure: boolean;
  readonly cause?: unknown;
}> {}

/**
 * Schedule and cron-related errors
 */
export class ScheduleError extends Data.TaggedError("ScheduleError")<{
  readonly message: string;
  readonly cronExpression: string;
  readonly nextRun?: Date;
  readonly cause?: unknown;
}> {}

/**
 * API-related errors for REST endpoints
 */
export class APIError extends Data.TaggedError("APIError")<{
  readonly message: string;
  readonly status: number;
  readonly cause?: unknown;
}> {}

/**
 * Validation errors for API requests
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly status: 400;
  readonly field: string;
  readonly expected: string;
  readonly cause?: unknown;
}> {}

/**
 * Resource not found errors
 */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string;
  readonly status: 404;
  readonly resource: string;
  readonly cause?: unknown;
}> {}

/**
 * Conflict errors for resource state conflicts
 */
export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly message: string;
  readonly status: 409;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Internal server errors
 */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly message: string;
  readonly status: 500;
  readonly cause?: unknown;
}> {}

// Union type for all service errors
export type AllServiceErrors = 
  | ServiceError
  | StartupError 
  | ShutdownError
  | HealthCheckError
  | WorkerError
  | ScheduleError;

// Union type for all API errors  
export type AllAPIErrors =
  | APIError
  | ValidationError
  | NotFoundError
  | ConflictError
  | InternalError;

// Union type for all errors
export type AllErrors = AllServiceErrors | AllAPIErrors;