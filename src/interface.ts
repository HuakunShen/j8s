import { Effect } from "effect";

export type ServiceStatus =
  | "stopped"
  | "running"
  | "stopping"
  | "crashed"
  | "unhealthy";

export type RestartPolicy = "always" | "unless-stopped" | "on-failure" | "no";

export interface HealthCheckResult {
  status: ServiceStatus;
  details?: Record<string, unknown>;
}

export interface IService {
  name: string;
  start(): Effect.Effect<void, unknown>;
  stop(): Effect.Effect<void, unknown>;
  healthCheck(): Effect.Effect<HealthCheckResult, unknown>;
}

export interface IServiceRPC {
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}

export interface CronJobConfig {
  schedule: string; // cron expression
  timeout?: number; // optional timeout in milliseconds
}

export interface ServiceConfig {
  restartPolicy?: RestartPolicy;
  maxRetries?: number; // used with on-failure policy
  cronJob?: CronJobConfig;
}

export interface IServiceManager {
  readonly services: IService[];
  addService(service: IService, config?: ServiceConfig): void;
  removeService(serviceName: string): void;
  startService(serviceName: string): Effect.Effect<void, unknown>;
  stopService(serviceName: string): Effect.Effect<void, unknown>;
  restartService(serviceName: string): Effect.Effect<void, unknown>;
  healthCheckService(
    serviceName: string
  ): Effect.Effect<HealthCheckResult, unknown>;
  startAllServices(): Effect.Effect<void, unknown>;
  stopAllServices(): Effect.Effect<void, unknown>;
  healthCheckAllServices(): Effect.Effect<
    Record<string, HealthCheckResult>,
    unknown
  >;
}
