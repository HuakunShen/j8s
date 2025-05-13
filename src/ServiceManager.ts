import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
} from "./interface";
import { CronJob } from "cron";

interface ServiceEntry {
  service: IService;
  config: ServiceConfig;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
  cronJob?: CronJob;
}

export class ServiceManager implements IServiceManager {
  private serviceMap: Map<string, ServiceEntry> = new Map();

  get services(): IService[] {
    return Array.from(this.serviceMap.values()).map((entry) => entry.service);
  }

  public addService(service: IService, config: ServiceConfig = {}): void {
    if (this.serviceMap.has(service.name)) {
      throw new Error(`Service with name '${service.name}' already exists`);
    }

    const serviceEntry: ServiceEntry = {
      service,
      config,
      restartCount: 0,
    };

    this.serviceMap.set(service.name, serviceEntry);

    // Set up cron job if configured
    if (config.cronJob) {
      this.setupCronJob(serviceEntry);
    }
  }

  public removeService(serviceName: string): void {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      return;
    }

    // Clean up any timers
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
    }

    // Stop any active cron job
    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    this.serviceMap.delete(serviceName);
  }

  public async startService(serviceName: string): Promise<void> {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    try {
      await entry.service.start();
      entry.restartCount = 0;
    } catch (error) {
      await this.handleServiceFailure(entry, error);
    }
  }

  public async stopService(serviceName: string): Promise<void> {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Clear any pending restart
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
      entry.restartTimer = undefined;
    }

    // Stop any active cron job
    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    await entry.service.stop();
  }

  public async restartService(serviceName: string): Promise<void> {
    await this.stopService(serviceName);
    await this.startService(serviceName);
  }

  public async healthCheckService(
    serviceName: string
  ): Promise<HealthCheckResult> {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    return await entry.service.healthCheck();
  }

  public async startAllServices(): Promise<void> {
    const startPromises = Array.from(this.serviceMap.values()).map((entry) =>
      this.startService(entry.service.name)
    );

    await Promise.all(startPromises);
  }

  public async stopAllServices(): Promise<void> {
    const services = Array.from(this.serviceMap.values());
    const stopResults = await Promise.allSettled(
      services.map((entry) => this.stopService(entry.service.name))
    );

    stopResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        const serviceName = services[idx]?.service.name;
        console.error(
          `Failed to stop service '${serviceName}':`,
          result.reason
        );
      }
    });
  }

  public async healthCheckAllServices(): Promise<
    Record<string, HealthCheckResult>
  > {
    const results: Record<string, HealthCheckResult> = {};

    for (const [name, entry] of this.serviceMap.entries()) {
      results[name] = await entry.service.healthCheck();
    }

    return results;
  }

  private async handleServiceFailure(
    entry: ServiceEntry,
    error: unknown
  ): Promise<void> {
    const { service, config } = entry;
    const policy = config.restartPolicy || "on-failure";
    const maxRetries = config.maxRetries || 3;

    console.error(`Service '${service.name}' failed: ${error}`);

    // Don't restart if policy is 'no'
    if (policy === "no") {
      return;
    }

    // For 'on-failure', check if we've exceeded maxRetries
    if (policy === "on-failure" && entry.restartCount >= maxRetries) {
      console.error(
        `Service '${service.name}' exceeded max restart attempts (${maxRetries})`
      );
      return;
    }

    // Schedule restart with exponential backoff
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(
      baseDelay * Math.pow(2, entry.restartCount),
      maxDelay
    );

    console.log(
      `Restarting service '${service.name}' in ${delay}ms (attempt ${entry.restartCount + 1})`
    );

    // Clear any existing restart timer
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
    }

    // Set up restart timer
    entry.restartTimer = setTimeout(async () => {
      entry.restartCount++;
      entry.restartTimer = undefined;

      try {
        await service.start();
      } catch (err) {
        await this.handleServiceFailure(entry, err);
      }
    }, delay);
  }

  private setupCronJob(entry: ServiceEntry): void {
    if (!entry.config.cronJob) return;

    const { schedule } = entry.config.cronJob;
    const { service } = entry;

    // Clean up any existing cron job
    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    // Create a new cron job using the cron package
    entry.cronJob = new CronJob(
      schedule,
      async () => {
        try {
          // Start the service, which should auto-terminate if configured that way
          await service.start();

          // If a timeout is specified, ensure the service stops
          if (entry.config.cronJob?.timeout) {
            setTimeout(async () => {
              try {
                if (service.getStatus() !== "stopped") {
                  await service.stop();
                }
              } catch (error) {
                console.error(
                  `Error stopping service '${service.name}' after timeout: ${error}`
                );
              }
            }, entry.config.cronJob.timeout);
          }
        } catch (error) {
          console.error(
            `Error running cron job for service '${service.name}': ${error}`
          );
        }
      },
      null, // onComplete
      true, // start immediately
      undefined // timezone (use system timezone)
    );
  }
}
