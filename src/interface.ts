import type { Effect, Schedule, Duration } from "effect";

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
  cronJob?: CronJobConfig; // Backward compatibility - deprecated, use scheduledJob instead
}

// Backward compatibility - deprecated, use ScheduledJobConfig instead
export interface CronJobConfig {
  schedule: string; // cron expression - deprecated
  timeout?: number; // optional timeout in milliseconds - deprecated
}

export interface IServiceManager {
  services: IService[];
  addService(service: IService, config?: ServiceConfig): void;
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
