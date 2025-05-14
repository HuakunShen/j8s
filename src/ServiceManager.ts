import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
  ServiceStatus,
} from "./interface";
import { CronJob } from "cron";

interface ServiceEntry {
  service: IService;
  config: ServiceConfig;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
  cronJob?: CronJob;
  status: ServiceStatus;
  runningPromise?: Promise<void>;
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
      status: "stopped",
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

    // Directly move to running when attempting to start
    try {
      // Try to start the service
      try {
        // Set status to running right away - if start() throws, we'll handle it
        entry.status = "running";
        await entry.service.start();
      } catch (error) {
        // Immediate failure during startup
        entry.status = "crashed";

        // Only attempt to restart if restart policy allows it
        if (entry.config.restartPolicy !== "no") {
          await this.handleServiceFailure(entry, error);
        }

        throw error; // Re-throw the error for the caller
      }

      // If we get here, the service started successfully initially
      // Set up the promise for long-running service monitoring
      entry.runningPromise = Promise.resolve()
        .then(() => {
          // Service completed successfully
          if (entry.status === "running") {
            entry.status = "stopped";
            console.log(`Service '${serviceName}' completed successfully`);
          }
        })
        .catch((error) => {
          // Service failed after starting
          if (entry.status === "running") {
            this.handleServiceFailure(entry, error);
          }
        });

      entry.restartCount = 0;
    } catch (error) {
      // We've already set status to "crashed" in the inner catch block
      throw error;
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

    entry.status = "stopping";

    try {
      await entry.service.stop();
      entry.status = "stopped";
    } catch (error) {
      console.error(`Error stopping service '${serviceName}':`, error);
      entry.status = "crashed";
    }
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

    const serviceHealth = await entry.service.healthCheck();

    // Override the status with our managed status
    return {
      ...serviceHealth,
      status: entry.status, // Use our managed status, not the service's
    };
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
      // Call healthCheckService for each service
      results[name] = await this.healthCheckService(name);
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

    // Update service status
    entry.status = "crashed";

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
        // Set status to running right away
        entry.status = "running";

        // Create the promise for the long-running service
        entry.runningPromise = entry.service
          .start()
          .then(() => {
            // Service completed successfully
            if (entry.status === "running") {
              entry.status = "stopped";
              console.log(`Service '${service.name}' completed successfully`);
            }
          })
          .catch((error) => {
            // Service failed
            if (entry.status === "running") {
              this.handleServiceFailure(entry, error);
            }
          });
      } catch (err) {
        entry.status = "crashed";
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
          // Set status to running directly
          entry.status = "running";

          // Create the promise for the long-running service
          entry.runningPromise = service
            .start()
            .then(() => {
              // Service completed successfully
              if (entry.status === "running") {
                entry.status = "stopped";
                console.log(`Service '${service.name}' completed successfully`);
              }
            })
            .catch((error) => {
              // Service failed
              if (entry.status === "running") {
                this.handleServiceFailure(entry, error);
              }
            });

          // If a timeout is specified, ensure the service stops
          if (entry.config.cronJob?.timeout) {
            setTimeout(async () => {
              try {
                if (entry.status === "running") {
                  entry.status = "stopping";
                  await service.stop();
                  entry.status = "stopped";
                }
              } catch (error) {
                console.error(
                  `Error stopping service '${service.name}' after timeout: ${error}`
                );
                entry.status = "crashed";
              }
            }, entry.config.cronJob.timeout);
          }
        } catch (error) {
          console.error(
            `Error running cron job for service '${service.name}': ${error}`
          );
          entry.status = "crashed";
        }
      },
      null, // onComplete
      true, // start immediately
      undefined // timezone (use system timezone)
    );
  }
}
