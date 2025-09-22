import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
  ServiceStatus,
} from "./interface";
import { CronJob } from "cron";
import { Effect, Schedule, Duration, Ref, Fiber, Console } from "effect";

interface ServiceEntry {
  service: IService;
  config: ServiceConfig;
  restartCount: Ref.Ref<number>;
  restartTimer?: NodeJS.Timeout;
  cronJob?: CronJob;
  status: Ref.Ref<ServiceStatus>;
  runningPromise?: Promise<void>;
  runningFiber?: Fiber.Fiber<void, unknown>;
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

    // Use Effect's Ref for thread-safe state management
    const serviceEntry: ServiceEntry = {
      service,
      config,
      restartCount: Effect.runSync(Ref.make(0)),
      status: Effect.runSync(Ref.make("stopped" as ServiceStatus)),
    };

    this.serviceMap.set(service.name, serviceEntry);

    // Set up cron job if configured
    if (config.cronJob) {
      this.setupCronJob(serviceEntry);
    }
  }

  public async removeService(serviceName: string): Promise<void> {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      return;
    }

    try {
      // Stop the service first if it's running
      if (entry.status === "running" || entry.status === "stopping") {
        await this.stopService(serviceName);
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
    } catch (error) {
      console.error(`Error removing service '${serviceName}':`, error);
      // Still remove from map even if stop fails to prevent orphaned entries
      this.serviceMap.delete(serviceName);
      throw error;
    }
  }

  public async startService(serviceName: string): Promise<void> {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Clear any pending restart
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
      entry.restartTimer = undefined;
    }

    // Use Effect internally for better reliability and resource safety
    const startServiceEffect = Effect.gen(function* () {
      // Set status to running using Effect's Ref
      yield* Ref.set(entry.status, "running");
      
      // Convert Promise-based service.start() to Effect
      yield* Effect.tryPromise({
        try: () => entry.service.start(),
        catch: (error) => error
      });

      // Reset restart count on successful start
      yield* Ref.set(entry.restartCount, 0);
      
    }).pipe(
      // Add Effect's built-in resource safety
      Effect.ensuring(
        Effect.sync(() => {
          console.log(`Service '${serviceName}' startup effect completed`);
        })
      ),
      // Handle errors with Effect's structured error handling
      Effect.tapError((error) =>
        Effect.gen(function* () {
          yield* Ref.set(entry.status, "crashed");
          yield* Console.error(`Service '${serviceName}' failed:`, error);
          
          // Handle restart based on policy using Effect
          if (entry.config.restartPolicy !== "no") {
            // Use arrow function to preserve this context
            const restartPromise = () => this.scheduleServiceRestart(entry);
            yield* Effect.fork(Effect.promise(restartPromise));
          }
        })
      ),
      // Success handling
      Effect.tap(() =>
        Effect.gen(function* () {
          const currentStatus = yield* Ref.get(entry.status);
          if (currentStatus === "running") {
            yield* Ref.set(entry.status, "stopped");
            yield* Console.log(`Service '${serviceName}' completed successfully`);
          }
        })
      )
    );

    try {
      // Fork the Effect to run in background with resource safety
      const fiber = Effect.runFork(startServiceEffect);
      entry.runningFiber = fiber;

      // Wait a short time to catch immediate startup errors
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if the service is still running (not crashed)
      const currentStatus = Effect.runSync(Ref.get(entry.status));
      if (currentStatus !== "running") {
        throw new Error(`Service '${serviceName}' failed to start`);
      }

    } catch (error) {
      // Service failed immediately
      console.error(`Service '${serviceName}' failed:`, error);
      Effect.runSync(Ref.set(entry.status, "crashed"));

      // Handle restart based on policy
      if (entry.config.restartPolicy !== "no") {
        await this.scheduleServiceRestart(entry);
      }

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

    // Interrupt any running Effect fiber for better resource cleanup
    if (entry.runningFiber) {
      Effect.runFork(Fiber.interrupt(entry.runningFiber));
    }

    // Use Effect internally for better timeout handling and resource safety
    const stopServiceEffect = Effect.gen(function* () {
      yield* Ref.set(entry.status, "stopping");
      
      // Convert Promise-based service.stop() to Effect with timeout
      yield* Effect.tryPromise({
        try: () => entry.service.stop(),
        catch: (error) => error
      }).pipe(
        Effect.timeout(Duration.seconds(10)) // Built-in timeout with Effect
      );

      yield* Ref.set(entry.status, "stopped");
      yield* Ref.set(entry.restartCount, 0); // Reset restart count
      
    }).pipe(
      Effect.tapError((error) =>
        Effect.gen(function* () {
          yield* Console.error(`Error stopping service '${serviceName}':`, error);
          yield* Ref.set(entry.status, "crashed");
        })
      )
    );

    try {
      // Run the Effect and convert back to Promise for API compatibility
      await Effect.runPromise(stopServiceEffect);
    } catch (error) {
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
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    // Use Effect internally for better error handling and timeout
    const healthCheckEffect = Effect.gen(function* () {
      const serviceHealth = yield* Effect.tryPromise({
        try: () => entry.service.healthCheck(),
        catch: (error) => ({
          status: "unhealthy" as const,
          details: { error: String(error) },
        })
      }).pipe(
        Effect.timeout(Duration.seconds(5)) // Prevent hanging health checks
      );

      const currentStatus = yield* Ref.get(entry.status);
      
      // Override the status with our managed status
      return {
        ...serviceHealth,
        status: currentStatus, // Use our managed status, not the service's
      };
    }).pipe(
      Effect.catchAll(() =>
        Effect.gen(function* () {
          const currentStatus = yield* Ref.get(entry.status);
          return {
            status: currentStatus,
            details: { error: "Health check failed" },
          };
        })
      )
    );

    return await Effect.runPromise(healthCheckEffect);
  }

  public async startAllServices(): Promise<void> {
    // Use Effect for better concurrency control and error handling
    const serviceNames = Array.from(this.serviceMap.keys());
    
    const startAllEffect = Effect.forEach(
      serviceNames,
      (serviceName) => Effect.tryPromise({
        try: () => this.startService(serviceName),
        catch: (error) => {
          console.error(`Failed to start service '${serviceName}':`, error);
          return error;
        }
      }),
      { concurrency: "unbounded" } // Allow concurrent starts
    );

    await Effect.runPromise(startAllEffect);
  }

  public async stopAllServices(): Promise<void> {
    // Use Effect for better error handling and resource safety
    const serviceNames = Array.from(this.serviceMap.keys());
    
    const stopAllEffect = Effect.forEach(
      serviceNames,
      (serviceName) => Effect.tryPromise({
        try: () => this.stopService(serviceName),
        catch: (error) => {
          console.error(`Failed to stop service '${serviceName}':`, error);
          return error;
        }
      }).pipe(
        Effect.catchAll(() => Effect.void) // Continue even if stop fails
      ),
      { concurrency: "unbounded" } // Allow concurrent stops
    );

    await Effect.runPromise(stopAllEffect);
  }

  public async healthCheckAllServices(): Promise<
    Record<string, HealthCheckResult>
  > {
    // Use Effect for better concurrency and error handling
    const serviceNames = Array.from(this.serviceMap.keys());
    
    const healthCheckAllEffect = Effect.forEach(
      serviceNames,
      (serviceName) => Effect.tryPromise({
        try: () => this.healthCheckService(serviceName),
        catch: (error) => ({
          status: "unhealthy" as const,
          details: { error: String(error) },
        })
      }).pipe(
        Effect.map((health) => [serviceName, health] as const)
      ),
      { concurrency: "unbounded" }
    ).pipe(
      Effect.map((results) => Object.fromEntries(results))
    );

    return await Effect.runPromise(healthCheckAllEffect);
  }

  private async scheduleServiceRestart(entry: ServiceEntry): Promise<void> {
    const { service, config } = entry;
    const policy = config.restartPolicy || "on-failure";
    const maxRetries = config.maxRetries || 3;

    // Use Effect's built-in retry scheduling instead of manual exponential backoff
    const restartServiceEffect = Effect.gen(function* () {
      const currentRestartCount = yield* Ref.get(entry.restartCount);
      
      // For 'on-failure', check if we've exceeded maxRetries
      if (policy === "on-failure" && currentRestartCount >= maxRetries) {
        yield* Console.error(
          `Service '${service.name}' exceeded max restart attempts (${maxRetries})`
        );
        return;
      }

      yield* Console.log(
        `Scheduling restart for service '${service.name}' (attempt ${currentRestartCount + 1})`
      );

      // Increment restart count
      yield* Ref.update(entry.restartCount, count => count + 1);

      // Use Effect's built-in exponential backoff with jittering
      const restartEffect = Effect.tryPromise({
        try: () => this.startService(service.name),
        catch: (error) => error
      });

      // Apply different retry schedules based on restart policy
      const schedule = policy === "always" 
        ? Schedule.exponential(Duration.seconds(1)).pipe(
            Schedule.compose(Schedule.upTo(Duration.seconds(30))),
            Schedule.jittered() // Built-in jittering to prevent thundering herd
          )
        : Schedule.exponential(Duration.seconds(1)).pipe(
            Schedule.compose(Schedule.recurs(maxRetries - currentRestartCount)),
            Schedule.compose(Schedule.upTo(Duration.seconds(30))),
            Schedule.jittered()
          );

      yield* restartEffect.pipe(
        Effect.retry(schedule),
        Effect.catchAll((error) =>
          Console.error(`Failed to restart service '${service.name}':`, error)
        )
      );

    }).pipe(
      Effect.delay(Duration.seconds(1)) // Initial delay before restart
    );

    // Convert Effect back to Promise for API compatibility
    try {
      await Effect.runPromise(restartServiceEffect);
    } catch (error) {
      console.error(`Restart scheduling failed for '${service.name}':`, error);
    }
  }

  private async handleServiceFailure(
    entry: ServiceEntry,
    error: unknown
  ): Promise<void> {
    const { service } = entry;
    
    // Use Effect for better error handling and state management
    const handleFailureEffect = Effect.gen(function* () {
      yield* Console.error(`Service '${service.name}' failed:`, error);
      yield* Ref.set(entry.status, "crashed");

      // Don't restart if policy is 'no'
      if (entry.config.restartPolicy !== "no") {
        // Use arrow function to preserve this context
        const restartPromise = () => this.scheduleServiceRestart(entry);
        yield* Effect.fork(Effect.promise(restartPromise));
      }
    });

    await Effect.runPromise(handleFailureEffect);
  }

  private setupCronJob(entry: ServiceEntry): void {
    if (!entry.config.cronJob) return;

    const { schedule } = entry.config.cronJob;
    const { service } = entry;

    // Clean up any existing cron job
    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    // Create a new cron job using the cron package (maintaining backward compatibility)
    // But use Effect internally for better error handling and resource safety
    entry.cronJob = new CronJob(
      schedule,
      async () => {
        // Use Effect internally for better error handling and resource management
        const cronJobEffect = Effect.gen(function* () {
          yield* Ref.set(entry.status, "running");
          yield* Console.log(`Running cron job for service '${service.name}'`);

          // Convert service.start() to Effect with timeout support
          const serviceStartEffect = Effect.tryPromise({
            try: () => service.start(),
            catch: (error) => error
          }).pipe(
            entry.config.cronJob?.timeout 
              ? Effect.timeout(Duration.millis(entry.config.cronJob.timeout))
              : Effect.identity
          );

          yield* serviceStartEffect.pipe(
            Effect.tapBoth({
              onFailure: (error) => Effect.gen(function* () {
                yield* Ref.set(entry.status, "crashed");
                // Use arrow function to preserve this context
                const handleFailure = () => this.handleServiceFailure(entry, error);
                yield* Effect.promise(handleFailure);
              }),
              onSuccess: () => Effect.gen(function* () {
                const currentStatus = yield* Ref.get(entry.status);
                if (currentStatus === "running") {
                  yield* Ref.set(entry.status, "stopped");
                  yield* Console.log(`Service '${service.name}' completed successfully`);
                }
              })
            }),
            // Add Effect's resource safety
            Effect.ensuring(
              Effect.sync(() => {
                console.log(`Cron job effect cleanup for '${service.name}'`);
              })
            )
          );

        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Console.error(`Error running cron job for service '${service.name}':`, error);
              yield* Ref.set(entry.status, "crashed");
            })
          )
        );

        // Run the Effect (convert back to Promise for cron compatibility)
        try {
          await Effect.runPromise(cronJobEffect);
        } catch (error) {
          console.error(`Cron job failed for '${service.name}':`, error);
        }
      },
      null, // onComplete
      true, // start immediately
      undefined // timezone (use system timezone)
    );
  }
}
