import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
  ServiceStatus,
  ScheduledJobConfig,
  CronJobConfig,
} from "./interface";
import { Effect, Schedule, Duration, Fiber } from "effect";
import { IServiceAdapter } from "./IServiceAdapter";

interface ManagedService {
  name: string;
  adapter: IServiceAdapter;
  config: ServiceConfig;
  status: ServiceStatus;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
  scheduledJobFiber?: Fiber.RuntimeFiber<void, Error>;
}

export class ServiceManager implements IServiceManager {
  private managedServices: Map<string, ManagedService> = new Map();

  get services(): IService[] {
    return Array.from(this.managedServices.values()).map((managed) => {
      const service = managed.adapter.service;
      return service;
    });
  }

  public addService(service: IService, config: ServiceConfig = {}): void {
    if (this.managedServices.has(service.name)) {
      throw new Error(`Service with name '${service.name}' already exists`);
    }

    const adapter = new IServiceAdapter(service);
    const managedService: ManagedService = {
      name: service.name,
      adapter,
      config,
      status: "stopped",
      restartCount: 0,
    };

    this.managedServices.set(service.name, managedService);

    // Handle backward compatibility for cronJob
    if (config.cronJob && !config.scheduledJob) {
      console.warn(
        `cronJob configuration for service "${service.name}" is deprecated. Please use scheduledJob instead.`
      );
      // Convert cronJob to scheduledJob format
      const { schedule: cronExpression, timeout } = config.cronJob;
      const cronSchedule = Schedule.cron(cronExpression);
      managedService.config.scheduledJob = {
        schedule: cronSchedule,
        timeout: timeout ? Duration.millis(timeout) : undefined,
      };
    }

    // Set up scheduled job if configured
    if (config.scheduledJob || managedService.config.scheduledJob) {
      this.setupScheduledJob(managedService);
    }
  }

  // Effect-based API methods
  public startServiceEffect(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    return Effect.gen(function* () {
      // Clear any pending restart
      if (managedService.restartTimer) {
        clearTimeout(managedService.restartTimer);
        managedService.restartTimer = undefined;
      }

      // Set status to running
      managedService.status = "running";

      // Start the service using the hybrid adapter approach
      yield* Effect.tryPromise({
        try: () => managedService.adapter.start(),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });

      // Reset restart count on successful start
      managedService.restartCount = 0;
    });
  }

  public stopServiceEffect(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    return Effect.gen(function* () {
      // Clear any pending restart
      if (managedService.restartTimer) {
        clearTimeout(managedService.restartTimer);
        managedService.restartTimer = undefined;
      }

      // Stop any active scheduled job
      if (managedService.scheduledJobFiber) {
        Effect.runFork(Fiber.interrupt(managedService.scheduledJobFiber));
        managedService.scheduledJobFiber = undefined;
      }

      managedService.status = "stopping";

      // Stop the service using the hybrid adapter approach
      yield* Effect.tryPromise({
        try: () => managedService.adapter.stop(),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });

      managedService.status = "stopped";
      managedService.restartCount = 0;
    });
  }

  public restartServiceEffect(serviceName: string): Effect.Effect<void, Error> {
    const self = this;
    return Effect.gen(function* () {
      yield* self.stopServiceEffect(serviceName);
      yield* self.startServiceEffect(serviceName);
    });
  }

  public healthCheckServiceEffect(
    serviceName: string
  ): Effect.Effect<HealthCheckResult, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    return Effect.gen(function* () {
      // Use the adapter's Effect-based health check
      const serviceHealth = yield* managedService.adapter.healthCheck;

      // Override the status with our managed status
      return {
        ...serviceHealth,
        status: managedService.status, // Use our managed status, not the service's
      };
    });
  }

  public startAllServicesEffect(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const startEffects = serviceNames.map((name) =>
      this.startServiceEffect(name)
    );

    return Effect.all(startEffects).pipe(Effect.andThen(Effect.void));
  }

  public stopAllServicesEffect(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const stopEffects = serviceNames.map((name) => this.stopServiceEffect(name));

    return Effect.all(stopEffects).pipe(Effect.andThen(Effect.void));
  }

  public healthCheckAllServicesEffect(): Effect.Effect<
    Record<string, HealthCheckResult>,
    Error
  > {
    const serviceNames = Array.from(this.managedServices.keys());
    const healthEffects = serviceNames.map((name) =>
      Effect.map(
        this.healthCheckServiceEffect(name),
        (result) => [name, result] as const
      )
    );

    return Effect.gen(function* () {
      const results = yield* Effect.all(healthEffects);
      return Object.fromEntries(results);
    });
  }

  public async removeService(serviceName: string): Promise<void> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return;
    }

    try {
      // Stop the service first if it's running
      if (
        managedService.status === "running" ||
        managedService.status === "stopping"
      ) {
        await this.stopService(serviceName);
      }

      // Clean up any timers
      if (managedService.restartTimer) {
        clearTimeout(managedService.restartTimer);
      }

      // Stop any active scheduled job
      if (managedService.scheduledJobFiber) {
        Effect.runFork(Fiber.interrupt(managedService.scheduledJobFiber));
        managedService.scheduledJobFiber = undefined;
      }

      this.managedServices.delete(serviceName);
    } catch (error) {
      console.error(`Error removing service '${serviceName}':`, error);
      // Still remove from map even if stop fails to prevent orphaned entries
      this.managedServices.delete(serviceName);
      throw error;
    }
  }

  public async startService(serviceName: string): Promise<void> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Clear any pending restart
    if (managedService.restartTimer) {
      clearTimeout(managedService.restartTimer);
      managedService.restartTimer = undefined;
    }

    // Set status to running
    managedService.status = "running";

    try {
      // Start the service using the hybrid adapter approach
      await managedService.adapter.start();

      console.log(`Successfully started service '${serviceName}'`);

      // Reset restart count on successful start
      managedService.restartCount = 0;
    } catch (error) {
      // Service failed immediately
      console.error(`Service '${serviceName}' failed:`, error);
      managedService.status = "crashed";

      // Handle restart based on policy
      if (managedService.config.restartPolicy !== "no") {
        await this.scheduleServiceRestart(managedService);
      }

      throw error;
    }
  }

  public async stopService(serviceName: string): Promise<void> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Clear any pending restart
    if (managedService.restartTimer) {
      clearTimeout(managedService.restartTimer);
      managedService.restartTimer = undefined;
    }

    // Stop any active cron job
    if (managedService.scheduledJobFiber) {
      Effect.runFork(Fiber.interrupt(managedService.scheduledJobFiber));
    }

    managedService.status = "stopping";

    try {
      // Stop the service using the hybrid adapter approach
      await managedService.adapter.stop();

      managedService.status = "stopped";
      managedService.restartCount = 0;
    } catch (error) {
      console.error(`Error stopping service '${serviceName}':`, error);
      managedService.status = "crashed";
      throw error; // Re-throw to allow caller to handle
    }
  }

  public async restartService(serviceName: string): Promise<void> {
    await this.stopService(serviceName);
    await this.startService(serviceName);
  }

  public async healthCheckService(
    serviceName: string
  ): Promise<HealthCheckResult> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Use the adapter's Effect-based health check
    const serviceHealth = await Effect.runPromise(
      managedService.adapter.healthCheck
    );

    // Override the status with our managed status
    return {
      ...serviceHealth,
      status: managedService.status, // Use our managed status, not the service's
    };
  }

  public async startAllServices(): Promise<void> {
    const startPromises = Array.from(this.managedServices.values()).map(
      (managedService) => this.startService(managedService.name)
    );

    await Promise.all(startPromises);
  }

  public async stopAllServices(): Promise<void> {
    const services = Array.from(this.managedServices.values());
    const stopResults = await Promise.allSettled(
      services.map((managedService) => this.stopService(managedService.name))
    );

    stopResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        const serviceName = services[idx]?.name;
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

    for (const [name, managedService] of this.managedServices.entries()) {
      // Call healthCheckService for each service
      results[name] = await this.healthCheckService(name);
    }

    return results;
  }

  private async scheduleServiceRestart(
    managedService: ManagedService
  ): Promise<void> {
    const { name, config } = managedService;
    const policy = config.restartPolicy || "on-failure";
    const maxRetries = config.maxRetries || 3;

    // For 'on-failure', check if we've exceeded maxRetries
    if (policy === "on-failure" && managedService.restartCount >= maxRetries) {
      console.error(
        `Service '${name}' exceeded max restart attempts (${maxRetries})`
      );
      return;
    }

    // Schedule restart with exponential backoff
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(
      baseDelay * Math.pow(2, managedService.restartCount),
      maxDelay
    );

    console.log(
      `Scheduling restart for service '${name}' in ${delay}ms (attempt ${
        managedService.restartCount + 1
      })`
    );

    // Clear any existing restart timer
    if (managedService.restartTimer) {
      clearTimeout(managedService.restartTimer);
    }

    // Use promise to handle the timeout properly
    await new Promise<void>((resolve) => {
      managedService.restartTimer = setTimeout(() => {
        managedService.restartCount++;
        managedService.restartTimer = undefined;
        resolve();
      }, delay);
    });

    // Directly restart the service after the timer expires
    console.log(`Actually restarting service '${name}' now...`);
    await this.startService(name);
  }

  private async handleServiceFailure(
    managedService: ManagedService,
    error: unknown
  ): Promise<void> {
    const { name } = managedService;
    console.error(`Service '${name}' failed: ${error}`);

    // Update service status
    managedService.status = "crashed";

    // Don't restart if policy is 'no'
    if (managedService.config.restartPolicy !== "no") {
      await this.scheduleServiceRestart(managedService);
    }
  }

  private setupScheduledJob(managedService: ManagedService): void {
    if (!managedService.config.scheduledJob) return;

    const { schedule, timeout } = managedService.config.scheduledJob;
    const { name } = managedService;

    // Clean up any existing scheduled job
    if (managedService.scheduledJobFiber) {
      Effect.runFork(Fiber.interrupt(managedService.scheduledJobFiber));
    }

    // Create a new scheduled job using Effect
    const scheduledJobEffect = Effect.gen(function* () {
      // Create the job effect
      const jobEffect = Effect.gen(function* () {
        // Set status to running
        managedService.status = "running";

        // Start the service using Effect-based approach
        const serviceEffect = Effect.promise(() =>
          managedService.adapter.start()
        );

        // Apply timeout if configured
        const timedServiceEffect = timeout
          ? Effect.timeout(serviceEffect, timeout)
          : serviceEffect;

        const result = yield* Effect.either(timedServiceEffect);

        if (result._tag === "Left") {
          console.error(
            `Service '${name}' failed in scheduled job:`,
            result.left
          );
          managedService.status = "crashed";
        } else {
          // Service completed successfully
          if (managedService.status === "running") {
            managedService.status = "stopped";
            console.log(`Service '${name}' completed successfully`);
          }
        }
      });

      // Schedule the job to repeat with proper error handling
      yield* Effect.schedule(
        Effect.catchAllCause(jobEffect, () => Effect.void),
        schedule
      );
    });

    // Fork the scheduled job and store the fiber
    managedService.scheduledJobFiber = Effect.runFork(scheduledJobEffect);
  }
}
