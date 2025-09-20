import { Effect } from "effect";
import type { ServiceStatus } from "../interface";

export interface EffectHealthCheckResult {
  status: ServiceStatus;
  details?: Record<string, any>;
}

export interface IEffectService {
  name: string;
  start(): Effect.Effect<void, Error>;
  stop(): Effect.Effect<void, Error>;
  healthCheck(): Effect.Effect<EffectHealthCheckResult, never>;
}

export interface EffectCronJobConfig {
  schedule: string; // cron expression
  timeout?: number; // optional timeout in milliseconds
}

export interface EffectServiceConfig {
  restartPolicy?: "always" | "unless-stopped" | "on-failure" | "no";
  maxRetries?: number; // used with on-failure policy
  cronJob?: EffectCronJobConfig;
}

export interface IEffectServiceManager {
  services: IEffectService[];
  addService(service: IEffectService, config?: EffectServiceConfig): Effect.Effect<void, Error>;
  removeService(serviceName: string): Effect.Effect<void, Error>;
  startService(serviceName: string): Effect.Effect<void, Error>;
  stopService(serviceName: string): Effect.Effect<void, Error>;
  restartService(serviceName: string): Effect.Effect<void, Error>;
  healthCheckService(serviceName: string): Effect.Effect<EffectHealthCheckResult, Error>;
  startAllServices(): Effect.Effect<void, Error>;
  stopAllServices(): Effect.Effect<void, Error>;
  healthCheckAllServices(): Effect.Effect<Record<string, EffectHealthCheckResult>, never>;
}