import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
  ServiceStatus,
  ScheduledJobConfig,
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

    // Set up scheduled job if configured
    if (config.scheduledJob) {
      this.setupScheduledJob(managedService);
    }
  }

  // Effect-based API methods
  public startServiceEffect(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    // Clear any pending restart
    if (managedService.restartTimer) {
      clearTimeout(managedService.restartTimer);
      managedService.restartTimer = undefined;
    }

    managedService.status = "running";

    const startEffect = Effect.tryPromise({
      try: () => managedService.adapter.start(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });

    return Effect.matchEffect(startEffect, {
      onFailure: (error) => {
        // Sequence of effects to run on failure
        const onFailureEffect = Effect.sync(() => {
          console.error(`Service '${serviceName}' failed:`, error);
          managedService.status = "crashed";
        }).pipe(
          Effect.flatMap(() => {
            if (managedService.config.restartPolicy !== "no") {
              return Effect.tryPromise(() =>
                this.scheduleServiceRestart(managedService)
              );
            }
            return Effect.void;
          }),
          // Always propagate the original error
          Effect.andThen(Effect.fail(error))
        );
        return onFailureEffect;
      },
      onSuccess: () => {
        managedService.restartCount = 0;
        return Effect.void;
      },
    });
  }

  public stopServiceEffect(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

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

    const stopEffect = Effect.tryPromise({
      try: () => managedService.adapter.stop(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });

    return Effect.matchEffect(stopEffect, {
      onFailure: (error) => {
        console.error(`Error stopping service '${serviceName}':`, error);
        managedService.status = "crashed";
        return Effect.fail(error);
      },
      onSuccess: () => {
        managedService.status = "stopped";
        managedService.restartCount = 0;
        return Effect.void;
      },
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
    const self = this;
    
    return Effect.gen(function* () {
      yield* Effect.logInfo(`Starting all ${serviceNames.length} services concurrently`);
      
      // Start each service concurrently with unbounded concurrency
      const results = yield* Effect.all(
        serviceNames.map((name) =>
          self.startServiceEffect(name).pipe(
            Effect.tap(() => Effect.logInfo(`Service '${name}' started successfully`)),
            Effect.map(() => ({ 
              name, 
              success: true, 
              error: null as Error | null 
            })),
            Effect.catchAll((error) => {
              Effect.logError(`Service '${name}' failed to start`, error);
              return Effect.succeed({ 
                name, 
                success: false, 
                error 
              });
            })
          )
        ),
        { concurrency: 'unbounded' }
      );
      
      // Count successful and failed services
      const successfulServices = results.filter((r: { success: boolean }) => r.success);
      const failedServices = results.filter((r: { success: boolean }) => !r.success);
      
      yield* Effect.logInfo(`Service startup completed: ${successfulServices.length} successful, ${failedServices.length} failed`);
      
      // Check if any services failed to start
      if (failedServices.length > 0) {
        const errorMessages = failedServices
          .map((f: { name: string; error: Error | null }) => `${f.name}: ${f.error?.message || 'Unknown error'}`)
          .join(", ");
        yield* Effect.logError(`Failed to start ${failedServices.length} services: ${errorMessages}`);
        yield* Effect.fail(new Error(`Failed to start services: ${errorMessages}`));
      }
      
      yield* Effect.logInfo(`All ${serviceNames.length} services started successfully`);
    });
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
    await Effect.runPromise(this.startServiceEffect(serviceName));
  }

  public async stopService(serviceName: string): Promise<void> {
    await Effect.runPromise(this.stopServiceEffect(serviceName));
  }

  public async restartService(serviceName: string): Promise<void> {
    await Effect.runPromise(this.restartServiceEffect(serviceName));
  }

  public async healthCheckService(
    serviceName: string
  ): Promise<HealthCheckResult> {
    return await Effect.runPromise(
      this.healthCheckServiceEffect(serviceName)
    );
  }

  public async startAllServices(): Promise<void> {
    await Effect.runPromise(this.startAllServicesEffect());
  }

  public async stopAllServices(): Promise<void> {
    await Effect.runPromise(this.stopAllServicesEffect());
  }

  public async healthCheckAllServices(): Promise<
    Record<string, HealthCheckResult>
  > {
    return await Effect.runPromise(this.healthCheckAllServicesEffect());
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
