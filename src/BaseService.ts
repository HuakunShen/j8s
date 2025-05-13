import type { HealthCheckResult, IService, ServiceStatus } from "./interface";

/**
 * Abstract base class for services.
 * Note: Status management is now handled by the ServiceManager.
 * The setStatus and getStatus methods are deprecated and will be removed in a future version.
 */
export abstract class BaseService implements IService {
  public name: string;
  private status: ServiceStatus = "stopped";

  constructor(name: string) {
    this.name = name;
  }

  /**
   * @deprecated Use the status from ServiceManager healthCheck results instead.
   * Status is now managed by the ServiceManager.
   */
  protected setStatus(status: ServiceStatus): void {
    this.status = status;
    // This method is kept for backward compatibility only
    console.warn(`Warning: setStatus is deprecated and will be removed in a future version. 
    Status is now managed by the ServiceManager.`);
  }

  /**
   * @deprecated Use the status from ServiceManager healthCheck results instead.
   * Status is now managed by the ServiceManager.
   */
  public getStatus(): ServiceStatus {
    // This method is kept for backward compatibility only
    console.warn(`Warning: getStatus is deprecated and will be removed in a future version. 
    Status is now managed by the ServiceManager.`);
    return this.status;
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
