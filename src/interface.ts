import type { Effect, Schedule, Duration, Layer } from "effect";
import type { IEffectService } from "./IEffectService";

export type ServiceStatus =
  | "stopped"
  | "running"
  | "stopping"
  | "crashed"
  | "unhealthy";

export type RestartPolicy = "always" | "unless-stopped" | "on-failure" | "no";

export interface HealthCheckResult {
  status: ServiceStatus;
  details?: Record<string, any>;
}

export interface IService {
  name: string;
  observabilityLayer?: Layer.Layer<never, never, never>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}

export interface ScheduledJobConfig {
  schedule: Schedule.Schedule<unknown, unknown, never>;
  timeout?: Duration.Duration; // optional timeout duration
}

export interface ServiceConfig {
  restartPolicy?: RestartPolicy;
  maxRetries?: number; // used with on-failure policy
  scheduledJob?: ScheduledJobConfig;
}

export interface ObservabilityConfig {
  /**
   * Enable automatic OTLP observability for all services
   * @default false
   */
  enabled: boolean;
  
  /**
   * OTLP endpoint URL
   * @default "http://localhost:4318"
   */
  otlpBaseUrl?: string;
  
  /**
   * Default service namespace for all services
   * @default "default"
   */
  serviceNamespace?: string;
  
  /**
   * Default service version
   * @default "1.0.0"
   */
  serviceVersion?: string;
  
  /**
   * Default attributes for all services
   */
  defaultAttributes?: Record<string, string>;
}

export interface ServiceManagerConfig {
  /**
   * Observability configuration for automatic OTLP integration
   */
  observability?: ObservabilityConfig;
}

export interface IServiceManager {
  services: (IService | IEffectService)[];
  addService(service: IService | IEffectService, config?: ServiceConfig): void;
  removeService(serviceName: string): void;
  startService(serviceName: string): Promise<void>;
  stopService(serviceName: string): Promise<void>;
  restartService(serviceName: string): Promise<void>;
  healthCheckService(serviceName: string): Promise<HealthCheckResult>;
  startAllServices(): Promise<void>;
  stopAllServices(): Promise<void>;
  healthCheckAllServices(): Promise<Record<string, HealthCheckResult>>;

  // Effect-based methods
  startServiceEffect(serviceName: string): Effect.Effect<void, Error>;
  stopServiceEffect(serviceName: string): Effect.Effect<void, Error>;
  restartServiceEffect(serviceName: string): Effect.Effect<void, Error>;
  healthCheckServiceEffect(
    serviceName: string
  ): Effect.Effect<HealthCheckResult, Error>;
  startAllServicesEffect(): Effect.Effect<void, Error>;
  stopAllServicesEffect(): Effect.Effect<void, Error>;
  healthCheckAllServicesEffect(): Effect.Effect<
    Record<string, HealthCheckResult>,
    Error
  >;
}
