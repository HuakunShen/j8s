import { Effect, Schedule, Context, Option, Exit } from "effect";

// Service status types
export type ServiceStatus = "stopped" | "running" | "stopping" | "crashed" | "unhealthy" | "healthy" | "degraded";

// Error types
export class ServiceError {
  readonly _tag = "ServiceError";
  constructor(
    readonly message: string,
    readonly serviceName: string,
    readonly cause?: unknown
  ) {}
}

export class ResourceError {
  readonly _tag = "ResourceError";
  constructor(
    readonly message: string,
    readonly resourceName: string,
    readonly cause?: unknown
  ) {}
}

export class RetryLimitExceededError {
  readonly _tag = "RetryLimitExceededError";
  constructor(
    readonly message: string,
    readonly serviceName: string,
    readonly attempt: number
  ) {}
}

// Union type for all service errors
export type AnyServiceError = ServiceError | ResourceError | RetryLimitExceededError;

// Health check result
export interface HealthCheckResult {
  status: ServiceStatus;
  details?: Record<string, unknown>;
  timestamp: number;
}

// Service interface with Effect
export interface IEffectService {
  readonly name: string;
  start(): Effect.Effect<void, AnyServiceError>;
  stop(): Effect.Effect<void, AnyServiceError>;
  healthCheck(): Effect.Effect<HealthCheckResult, AnyServiceError>;
}

// Retry configuration
export interface RetryConfig {
  maxRetries?: number;
  schedule?: "exponential" | "linear" | "fixed";
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  rateLimit?: {
    maxAttempts: number;
    window: number; // time window in ms
  };
}

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  schedule: "exponential",
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  rateLimit: {
    maxAttempts: 10,
    window: 60000 // 1 minute
  }
};

// Service configuration
export interface ServiceConfig {
  restartPolicy?: "always" | "unless-stopped" | "on-failure" | "no";
  retry?: RetryConfig;
  gracefulShutdownTimeout?: number;
  healthCheckInterval?: number;
  cronJob?: CronJobConfig;
}

// Cron job configuration
export interface CronJobConfig {
  schedule: string; // cron expression
  timeout?: number;
  timezone?: string;
}

// Service context for dependencies
export interface ServiceContext {
  readonly logger: LoggingService;
  readonly tracer: TracingService;
  readonly config: ServiceConfig;
}

// Logging service interface
export interface LoggingService {
  info: (message: string, metadata?: Record<string, unknown>) => Effect.Effect<void>;
  warn: (message: string, metadata?: Record<string, unknown>) => Effect.Effect<void>;
  error: (message: string, error?: unknown, metadata?: Record<string, unknown>) => Effect.Effect<void>;
  debug: (message: string, metadata?: Record<string, unknown>) => Effect.Effect<void>;
}

// Tracing service interface
export interface TracingService {
  startSpan: (name: string) => Effect.Effect<Span>;
  currentSpan: () => Effect.Effect<Option.Option<Span>>;
  addEvent: (name: string, attributes?: Record<string, unknown>) => Effect.Effect<void>;
}

// Span interface (simplified)
export interface Span {
  end: () => Effect.Effect<void>;
  setAttribute: (key: string, value: unknown) => Effect.Effect<void>;
}

// Resource management
export interface ResourceManager {
  acquire<T>(
    name: string,
    acquire: Effect.Effect<T, ResourceError>,
    release: (resource: T, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, ResourceError>
  ): Effect.Effect<T, ResourceError>;
  releaseAll: () => Effect.Effect<void, ResourceError>;
}

// Health check interface
export interface HealthChecker {
  check: (service: IEffectService) => Effect.Effect<HealthCheckResult, AnyServiceError>;
}

// Service context tag for Effect dependency injection
export const ServiceContext = Context.GenericTag<ServiceContext>("ServiceContext");
