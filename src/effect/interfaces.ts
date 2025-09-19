import { Context, Effect, Layer, Schedule, Scope } from "effect";
import type { 
  HealthCheckResult, 
  ServiceStatus, 
  RestartPolicy,
  CronJobConfig
} from "../interface";
import type { AllServiceErrors, StartupError, ShutdownError, HealthCheckError } from "./errors";

/**
 * Service context tag for dependency injection
 */
export interface ServiceContext {
  readonly serviceRegistry: ServiceRegistry;
  readonly scheduleManager: ScheduleManager;
  readonly resourceManager: ResourceManager;
  readonly observabilityManager: ObservabilityManager;
}

export const ServiceContext = Context.GenericTag<ServiceContext>("@j8s/ServiceContext");

/**
 * Service registry for managing service instances
 */
export interface ServiceRegistry {
  readonly register: (service: EffectService) => Effect.Effect<void, never, never>;
  readonly unregister: (name: string) => Effect.Effect<void, never, never>;
  readonly get: (name: string) => Effect.Effect<EffectService, never, never>;
  readonly list: () => Effect.Effect<readonly EffectService[], never, never>;
}

export const ServiceRegistry = Context.GenericTag<ServiceRegistry>("@j8s/ServiceRegistry");

/**
 * Schedule manager for handling retry policies and cron scheduling
 */
export interface ScheduleManager {
  readonly createRetrySchedule: (policy: RetryPolicy) => Schedule.Schedule<any, unknown, any>;
  readonly createCronSchedule: (config: CronJobConfig) => Schedule.Schedule<any, unknown, any>;
}

export const ScheduleManager = Context.GenericTag<ScheduleManager>("@j8s/ScheduleManager");

/**
 * Resource manager for handling service resources
 */
export interface ResourceManager {
  readonly acquire: <R>(resource: Effect.Effect<R, never, never>) => Effect.Effect<R, never, Scope.Scope>;
  readonly release: (resource: unknown) => Effect.Effect<void, never, never>;
}

export const ResourceManager = Context.GenericTag<ResourceManager>("@j8s/ResourceManager");

/**
 * Observability manager for metrics and tracing
 */
export interface ObservabilityManager {
  readonly trace: <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  readonly incrementCounter: (name: string, tags?: Record<string, string>) => Effect.Effect<void, never, never>;
  readonly recordDuration: <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

export const ObservabilityManager = Context.GenericTag<ObservabilityManager>("@j8s/ObservabilityManager");

/**
 * Enhanced retry policy configuration using Effect Schedule
 */
export interface RetryPolicy {
  readonly type: "linear" | "exponential" | "fibonacci" | "spaced" | "jittered";
  readonly maxRetries?: number;
  readonly maxDuration?: number;
  readonly baseDelay?: number;
  readonly factor?: number;
}

/**
 * Enhanced service configuration with Effect-specific options
 */
export interface EffectServiceConfig {
  readonly restartPolicy?: RestartPolicy;
  readonly retryPolicy?: RetryPolicy;
  readonly cronJob?: CronJobConfig;
  readonly timeout?: number;
  readonly observability?: {
    readonly enableTracing?: boolean;
    readonly enableMetrics?: boolean;
    readonly tags?: Record<string, string>;
  };
}

/**
 * Effect-based service interface
 */
export interface EffectService {
  readonly name: string;
  readonly config: EffectServiceConfig;
  readonly start: () => Effect.Effect<void, StartupError, ServiceContext>;
  readonly stop: () => Effect.Effect<void, ShutdownError, ServiceContext>;
  readonly restart: () => Effect.Effect<void, StartupError | ShutdownError, ServiceContext>;
  readonly healthCheck: () => Effect.Effect<HealthCheckResult, HealthCheckError, ServiceContext>;
}

/**
 * Effect-based service manager interface
 */
export interface EffectServiceManager {
  readonly addService: (service: EffectService) => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly removeService: (name: string) => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly startService: (name: string) => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly stopService: (name: string) => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly restartService: (name: string) => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly healthCheckService: (name: string) => Effect.Effect<HealthCheckResult, AllServiceErrors, ServiceContext>;
  readonly startAllServices: () => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly stopAllServices: () => Effect.Effect<void, AllServiceErrors, ServiceContext>;
  readonly healthCheckAllServices: () => Effect.Effect<Record<string, HealthCheckResult>, AllServiceErrors, ServiceContext>;
  readonly getServiceStatus: (name: string) => Effect.Effect<ServiceStatus, AllServiceErrors, ServiceContext>;
}

export const EffectServiceManager = Context.GenericTag<EffectServiceManager>("@j8s/EffectServiceManager");

/**
 * Service layer factory for creating service instances with dependencies
 */
export interface ServiceLayer {
  readonly make: <T extends EffectService>(
    factory: (context: ServiceContext) => T
  ) => Layer.Layer<T, never, ServiceContext>;
}

export const ServiceLayer = Context.GenericTag<ServiceLayer>("@j8s/ServiceLayer");

/**
 * Health status with Effect-specific metadata
 */
export interface EffectHealthStatus extends HealthCheckResult {
  readonly status: ServiceStatus;
  readonly lastHealthCheck?: Date;
  readonly restartCount?: number;
  readonly uptime?: number;
  readonly metrics?: {
    readonly startupTime?: number;
    readonly errorCount?: number;
    readonly successCount?: number;
  };
}

/**
 * Service lifecycle events for observability
 */
export type ServiceLifecycleEvent = 
  | { readonly type: "service.starting"; readonly serviceName: string; readonly timestamp: Date }
  | { readonly type: "service.started"; readonly serviceName: string; readonly timestamp: Date; readonly duration: number }
  | { readonly type: "service.stopping"; readonly serviceName: string; readonly timestamp: Date }
  | { readonly type: "service.stopped"; readonly serviceName: string; readonly timestamp: Date; readonly duration: number }
  | { readonly type: "service.failed"; readonly serviceName: string; readonly timestamp: Date; readonly error: AllServiceErrors }
  | { readonly type: "service.restarting"; readonly serviceName: string; readonly timestamp: Date; readonly restartCount: number }
  | { readonly type: "health.check"; readonly serviceName: string; readonly timestamp: Date; readonly status: ServiceStatus };