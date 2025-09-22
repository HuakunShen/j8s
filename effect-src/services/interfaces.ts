import { Context, Effect, Schedule, Duration, Cron } from "effect"

/**
 * Service status in the Effect-based system
 */
export type ServiceStatus =
  | "stopped"
  | "running" 
  | "stopping"
  | "crashed"
  | "unhealthy"
  | "scheduled"

/**
 * Restart policy for services
 */
export type RestartPolicy = "always" | "unless-stopped" | "on-failure" | "no"

/**
 * Health check result with Effect error handling
 */
export interface HealthCheckResult {
  status: ServiceStatus
  details?: Record<string, unknown>
  timestamp: Date
}

/**
 * Effect-based service interface
 */
export interface IEffectService {
  readonly name: string
  readonly start: Effect.Effect<void, ServiceError, never>
  readonly stop: Effect.Effect<void, ServiceError, never>  
  readonly healthCheck: Effect.Effect<HealthCheckResult, ServiceError, never>
}

/**
 * Cron job configuration using Effect's Cron
 */
export interface CronJobConfig {
  readonly cron: Cron.Cron
  readonly timeout?: Duration.Duration
}

/**
 * Service configuration with Effect scheduling
 */
export interface ServiceConfig {
  readonly restartPolicy?: RestartPolicy
  readonly maxRetries?: number
  readonly retrySchedule?: Schedule.Schedule<void, unknown, unknown>
  readonly cronJob?: CronJobConfig
}

/**
 * Service errors using Effect's structured error handling
 */
export class ServiceError {
  readonly _tag = "ServiceError"
  constructor(
    readonly message: string,
    readonly serviceName?: string,
    readonly cause?: unknown
  ) {}
}

export class ServiceNotFoundError {
  readonly _tag = "ServiceNotFoundError"
  constructor(readonly serviceName: string) {}
}

export class ServiceAlreadyExistsError {
  readonly _tag = "ServiceAlreadyExistsError"
  constructor(readonly serviceName: string) {}
}

export class HealthCheckError {
  readonly _tag = "HealthCheckError"
  constructor(
    readonly serviceName: string,
    readonly cause?: unknown
  ) {}
}

/**
 * Service registry tag for Effect's service layer
 */
export const ServiceRegistry = Context.GenericTag<IServiceRegistry>("ServiceRegistry")

/**
 * Service registry interface for managing services
 */
export interface IServiceRegistry {
  readonly addService: (
    service: IEffectService, 
    config?: ServiceConfig
  ) => Effect.Effect<void, ServiceAlreadyExistsError, never>
  
  readonly removeService: (
    serviceName: string
  ) => Effect.Effect<void, ServiceNotFoundError, never>
  
  readonly getService: (
    serviceName: string
  ) => Effect.Effect<IEffectService, ServiceNotFoundError, never>
  
  readonly getAllServices: Effect.Effect<ReadonlyArray<IEffectService>, never, never>
  
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
}
