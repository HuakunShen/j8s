export type ServiceStatus =
  | "stopped"
  | "starting"
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
  services: IService[];
  addService(service: IService, config?: ServiceConfig): void;
  removeService(service: IService): void;
  startService(service: IService): Promise<void>;
  stopService(service: IService): Promise<void>;
  restartService(service: IService): Promise<void>;
  healthCheckService(service: IService): Promise<HealthCheckResult>;
  startAllServices(): Promise<void>;
  stopAllServices(): Promise<void>;
  healthCheckAllServices(): Promise<Record<string, HealthCheckResult>>;
}
