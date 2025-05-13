// Export interfaces and types
export type {
  ServiceStatus,
  RestartPolicy,
  HealthCheckResult,
  IService,
  CronJobConfig,
  ServiceConfig,
  IServiceManager,
} from "./src/interface";

// Export base classes
export { BaseService } from "./src/BaseService";
export { ServiceManager } from "./src/serviceManager";
export { WorkerService } from "./src/WorkerService";
export type { WorkerServiceOptions } from "./src/WorkerService";

// Create a helper to create a worker-based service
import { WorkerService, type WorkerServiceOptions } from "./src/WorkerService";

export function createWorkerService(
  name: string,
  workerPath: string | URL,
  options?: Partial<WorkerServiceOptions>,
) {
  const fullOptions: WorkerServiceOptions = {
    workerURL: workerPath,
    workerOptions: { type: "module" },
    autoTerminate: false,
    ...options,
  };

  return new WorkerService(name, fullOptions);
}
