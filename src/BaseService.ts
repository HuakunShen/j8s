import type { HealthCheckResult, IService } from "./interface";

/**
 * Abstract base class for services.
 * Status management is handled by the ServiceManager.
 */
export abstract class BaseService implements IService {
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;

  public async healthCheck(): Promise<HealthCheckResult> {
    // Return a minimal health check
    // The ServiceManager will add the correct status
    return {
      status: "stopped", // This will be replaced by ServiceManager
      details: {},
    };
  }
}
