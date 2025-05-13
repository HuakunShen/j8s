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
  getStatus(): ServiceStatus;
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
  removeService(serviceName: string): void;
  startService(serviceName: string): Promise<void>;
  stopService(serviceName: string): Promise<void>;
  restartService(serviceName: string): Promise<void>;
  healthCheckService(serviceName: string): Promise<HealthCheckResult>;
  startAllServices(): Promise<void>;
  stopAllServices(): Promise<void>;
  healthCheckAllServices(): Promise<Record<string, HealthCheckResult>>;
}
