import { Effect, Ref, Duration, Console, Fiber } from "effect";
import { CronJob } from "cron";
import type {
  EffectHealthCheckResult,
  IEffectService,
  IEffectServiceManager,
  EffectServiceConfig,
} from "./interfaces";
import type { ServiceStatus } from "../interface";

interface EffectServiceEntry {
  service: IEffectService;
  config: EffectServiceConfig;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
  cronJob?: CronJob;
  status: ServiceStatus;
  runningFiber?: Fiber.RuntimeFiber<void, Error>;
}

export class EffectServiceManager implements IEffectServiceManager {
  private serviceMapRef: Ref.Ref<Map<string, EffectServiceEntry>>;

  constructor() {
    this.serviceMapRef = Ref.unsafeMake(new Map());
  }

  get services(): IEffectService[] {
    return Effect.runSync(Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      return Array.from(serviceMap.values()).map((entry) => entry.service);
    }));
  }

  public addService(
    service: IEffectService,
    config: EffectServiceConfig = {}
  ): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);

      if (serviceMap.has(service.name)) {
        return yield* Effect.fail(new Error(`Service with name '${service.name}' already exists`));
      }

      const serviceEntry: EffectServiceEntry = {
        service,
        config,
        restartCount: 0,
        status: "stopped",
      };

      const newMap = new Map(serviceMap);
      newMap.set(service.name, serviceEntry);
      yield* Ref.set(this.serviceMapRef, newMap);

      // Set up cron job if configured
      if (config.cronJob) {
        yield* this.setupCronJob(serviceEntry);
      }
    });
  }

  public removeService(serviceName: string): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const entry = serviceMap.get(serviceName);

      if (!entry) {
        return;
      }

      try {
        // Stop the service first if it's running
        if (entry.status === "running" || entry.status === "stopping") {
          yield* this.stopService(serviceName);
        }

        // Clean up any timers
        if (entry.restartTimer) {
          clearTimeout(entry.restartTimer);
        }

        // Stop any active cron job
        if (entry.cronJob) {
          entry.cronJob.stop();
        }

        // Cancel running fiber
        if (entry.runningFiber) {
          yield* Fiber.interrupt(entry.runningFiber);
        }

        const newMap = new Map(serviceMap);
        newMap.delete(serviceName);
        yield* Ref.set(this.serviceMapRef, newMap);
      } catch (error) {
        yield* Console.error(`Error removing service '${serviceName}':`, error);
        // Still remove from map even if stop fails to prevent orphaned entries
        const newMap = new Map(serviceMap);
        newMap.delete(serviceName);
        yield* Ref.set(this.serviceMapRef, newMap);
        return yield* Effect.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public startService(serviceName: string): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const entry = serviceMap.get(serviceName);

      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
      }

      // Clear any pending restart
      if (entry.restartTimer) {
        clearTimeout(entry.restartTimer);
        entry.restartTimer = undefined;
      }

      // Update status to running
      yield* this.updateServiceStatus(serviceName, "running");

      try {
        // Start the service as a fiber
        const startEffect = entry.service.start();
        const fiber = yield* Effect.fork(startEffect);

        // Store the fiber reference
        yield* this.updateServiceEntry(serviceName, (entry) => ({
          ...entry,
          runningFiber: fiber,
        }));

        // Handle the fiber completion
        const handleCompletion = Effect.gen(this, function* () {
          try {
            yield* Fiber.await(fiber);
            // Service completed successfully
            yield* this.updateServiceStatus(serviceName, "stopped");
            yield* Console.log(`Service '${serviceName}' completed successfully`);
            yield* this.resetRestartCount(serviceName);
          } catch (error) {
            // Service failed
            yield* Console.error(`Service '${serviceName}' failed:`, error);
            yield* this.updateServiceStatus(serviceName, "crashed");

            const currentEntry = (yield* Ref.get(this.serviceMapRef)).get(serviceName);
            if (currentEntry && currentEntry.config.restartPolicy !== "no") {
              yield* this.scheduleServiceRestart(currentEntry);
            }
          }
        });

        // Fork the completion handler
        yield* Effect.fork(handleCompletion);

        // Wait a short time to catch immediate startup errors
        yield* Effect.sleep(Duration.millis(100));

        // Check if the service is still running (not crashed)
        const currentEntry = (yield* Ref.get(this.serviceMapRef)).get(serviceName);
        if (currentEntry?.status !== "running") {
          return yield* Effect.fail(new Error(`Service '${serviceName}' failed to start`));
        }

        // Reset restart count on successful start
        yield* this.resetRestartCount(serviceName);
      } catch (error) {
        // Service failed immediately
        yield* Console.error(`Service '${serviceName}' failed:`, error);
        yield* this.updateServiceStatus(serviceName, "crashed");

        const currentEntry = (yield* Ref.get(this.serviceMapRef)).get(serviceName);
        if (currentEntry && currentEntry.config.restartPolicy !== "no") {
          yield* this.scheduleServiceRestart(currentEntry);
        }

        return yield* Effect.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public stopService(serviceName: string): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const entry = serviceMap.get(serviceName);

      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
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

      yield* this.updateServiceStatus(serviceName, "stopping");

      try {
        // Cancel running fiber first
        if (entry.runningFiber) {
          yield* Fiber.interrupt(entry.runningFiber);
        }

        // Add timeout for stop operation to prevent hanging
        const stopEffect = Effect.race(
          entry.service.stop(),
          Effect.fail(new Error("Service stop timeout")).pipe(
            Effect.delay(Duration.seconds(10))
          )
        );

        yield* stopEffect;
        yield* this.updateServiceStatus(serviceName, "stopped");
        yield* this.resetRestartCount(serviceName);
      } catch (error) {
        yield* Console.error(`Error stopping service '${serviceName}':`, error);
        yield* this.updateServiceStatus(serviceName, "crashed");
        return yield* Effect.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public restartService(serviceName: string): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      yield* this.stopService(serviceName);
      yield* this.startService(serviceName);
    });
  }

  public healthCheckService(
    serviceName: string
  ): Effect.Effect<EffectHealthCheckResult, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const entry = serviceMap.get(serviceName);

      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
      }

      const serviceHealth = yield* entry.service.healthCheck();

      // Override the status with our managed status
      return {
        ...serviceHealth,
        status: entry.status, // Use our managed status, not the service's
      };
    });
  }

  public startAllServices(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const services = Array.from(serviceMap.values());

      const startEffects = services.map((entry) =>
        this.startService(entry.service.name)
      );

      yield* Effect.all(startEffects, { concurrency: "unbounded" });
    });
  }

  public stopAllServices(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const services = Array.from(serviceMap.values());

      const stopEffects = services.map((entry) =>
        this.stopService(entry.service.name).pipe(
          Effect.catchAll((error) =>
            Console.error(`Failed to stop service '${entry.service.name}':`, error)
          )
        )
      );

      yield* Effect.all(stopEffects, { concurrency: "unbounded" });
    });
  }

  public healthCheckAllServices(): Effect.Effect<
    Record<string, EffectHealthCheckResult>,
    never
  > {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const results: Record<string, EffectHealthCheckResult> = {};

      for (const [name] of serviceMap.entries()) {
        const result = yield* this.healthCheckService(name).pipe(
          Effect.catchAll((error) =>
            Effect.succeed({
              status: "crashed" as ServiceStatus,
              details: { error: String(error) },
            })
          )
        );
        results[name] = result;
      }

      return results;
    });
  }

  private updateServiceStatus(
    serviceName: string,
    status: ServiceStatus
  ): Effect.Effect<void, never> {
    return this.updateServiceEntry(serviceName, (entry) => ({
      ...entry,
      status,
    }));
  }

  private updateServiceEntry(
    serviceName: string,
    updater: (entry: EffectServiceEntry) => EffectServiceEntry
  ): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      const serviceMap = yield* Ref.get(this.serviceMapRef);
      const entry = serviceMap.get(serviceName);

      if (entry) {
        const newMap = new Map(serviceMap);
        newMap.set(serviceName, updater(entry));
        yield* Ref.set(this.serviceMapRef, newMap);
      }
    });
  }

  private resetRestartCount(serviceName: string): Effect.Effect<void, never> {
    return this.updateServiceEntry(serviceName, (entry) => ({
      ...entry,
      restartCount: 0,
    }));
  }

  private scheduleServiceRestart(
    entry: EffectServiceEntry
  ): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      const { service, config } = entry;
      const policy = config.restartPolicy || "on-failure";
      const maxRetries = config.maxRetries || 3;

      // For 'on-failure', check if we've exceeded maxRetries
      if (policy === "on-failure" && entry.restartCount >= maxRetries) {
        yield* Console.error(
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

      yield* Console.log(
        `Scheduling restart for service '${service.name}' in ${delay}ms (attempt ${entry.restartCount + 1})`
      );

      // Clear any existing restart timer
      if (entry.restartTimer) {
        clearTimeout(entry.restartTimer);
      }

      // Schedule the restart
      const scheduleRestart = Effect.gen(this, function* () {
        yield* Effect.sleep(Duration.millis(delay));
        yield* this.updateServiceEntry(service.name, (entry) => ({
          ...entry,
          restartCount: entry.restartCount + 1,
          restartTimer: undefined,
        }));

        yield* Console.log(`Actually restarting service '${service.name}' now...`);
        yield* this.startService(service.name).pipe(
          Effect.catchAll((error) =>
            Console.error(`Failed to restart service '${service.name}':`, error)
          )
        );
      });

      yield* Effect.fork(scheduleRestart);
    });
  }

  private setupCronJob(entry: EffectServiceEntry): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      if (!entry.config.cronJob) return;

      const { schedule } = entry.config.cronJob;
      const { service } = entry;

      // Clean up any existing cron job
      if (entry.cronJob) {
        entry.cronJob.stop();
      }

      // Create a new cron job using the cron package
      const cronJob = new CronJob(
        schedule,
        () => {
          const runCronJob = Effect.gen(this, function* () {
            try {
              // Set status to running directly
              yield* this.updateServiceStatus(service.name, "running");

              // Start the service
              const startEffect = service.start();
              const fiber = yield* Effect.fork(startEffect);

              // Update entry with the fiber
              yield* this.updateServiceEntry(service.name, (entry) => ({
                ...entry,
                runningFiber: fiber,
              }));

              const handleCompletion = Effect.gen(this, function* () {
                try {
                  yield* Fiber.await(fiber);
                  // Service completed successfully
                  yield* this.updateServiceStatus(service.name, "stopped");
                  yield* Console.log(`Service '${service.name}' completed successfully`);
                } catch (error) {
                  // Service failed
                  yield* this.handleServiceFailure(entry, error);
                }
              });

              // Fork the completion handler
              yield* Effect.fork(handleCompletion);

              // If a timeout is specified, ensure the service stops
              if (entry.config.cronJob?.timeout) {
                const timeoutEffect = Effect.gen(this, function* () {
                  yield* Effect.sleep(Duration.millis(entry.config.cronJob!.timeout!));
                  const currentEntry = (yield* Ref.get(this.serviceMapRef)).get(service.name);

                  if (currentEntry?.status === "running") {
                    yield* this.updateServiceStatus(service.name, "stopping");
                    yield* service.stop();
                    yield* this.updateServiceStatus(service.name, "stopped");
                  }
                }).pipe(
                  Effect.catchAll((error) =>
                    Effect.gen(this, function* () {
                      yield* Console.error(
                        `Error stopping service '${service.name}' after timeout:`,
                        error
                      );
                      yield* this.updateServiceStatus(service.name, "crashed");
                    })
                  )
                );

                yield* Effect.fork(timeoutEffect);
              }
            } catch (error) {
              yield* Console.error(
                `Error running cron job for service '${service.name}':`,
                error
              );
              yield* this.updateServiceStatus(service.name, "crashed");
            }
          });

          // Run the cron job effect
          Effect.runPromise(runCronJob);
        },
        null, // onComplete
        true, // start immediately
        undefined // timezone (use system timezone)
      );

      // Update the entry with the new cron job
      yield* this.updateServiceEntry(service.name, (entry) => ({
        ...entry,
        cronJob,
      }));
    });
  }

  private handleServiceFailure(
    entry: EffectServiceEntry,
    error: unknown
  ): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      const { service } = entry;
      yield* Console.error(`Service '${service.name}' failed: ${error}`);

      // Update service status
      yield* this.updateServiceStatus(service.name, "crashed");

      // Don't restart if policy is 'no'
      if (entry.config.restartPolicy !== "no") {
        yield* this.scheduleServiceRestart(entry);
      }
    });
  }
}