import type { HealthCheckResult, IService, ServiceStatus } from "./interface";

export abstract class BaseService implements IService {
  public name: string;
  private status: ServiceStatus = "stopped";

  constructor(name: string) {
    this.name = name;
  }

  protected setStatus(status: ServiceStatus): void {
    this.status = status;
  }

  public getStatus(): ServiceStatus {
    return this.status;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;

  public async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.status,
    };
  }
}
