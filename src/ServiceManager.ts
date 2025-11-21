import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  ServiceConfig,
  RestartPolicy,
  ServiceStatus,
  ScheduledJobConfig,
  ServiceManagerConfig,
  ObservabilityConfig,
} from "./interface";
import { Effect, Schedule, Duration, Fiber, Layer, Logger } from "effect";
import { IServiceAdapter } from "./IServiceAdapter";
import { IEffectServiceAdapter } from "./IEffectServiceAdapter";
import type { IEffectService } from "./IEffectService";
import { Otlp } from "@effect/opentelemetry";
import { FetchHttpClient } from "@effect/platform";

interface ManagedService {
  name: string;
  adapter: IServiceAdapter | IEffectServiceAdapter;
  config: ServiceConfig;
  status: ServiceStatus;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
  scheduledJobFiber?: Fiber.RuntimeFiber<void, Error>;
  observabilityLayer?: Layer.Layer<never, never, never>;
}

export class ServiceManager implements IServiceManager {
  private managedServices: Map<string, ManagedService> = new Map();
  private observabilityConfig?: ObservabilityConfig;

  constructor(config?: ServiceManagerConfig) {
    this.observabilityConfig = config?.observability;
  }

  get services(): (IService | IEffectService)[] {
    return Array.from(this.managedServices.values()).map((managed) => {
      const service = managed.adapter.service;
      return service;
    });
  }

  /**
   * Create a default OTLP observability layer for a service
   */
  private createDefaultObservabilityLayer(
    serviceName: string
  ): Layer.Layer<never, never, never> {
    const otlpBaseUrl =
      this.observabilityConfig?.otlpBaseUrl || "http://localhost:4318";
    const serviceNamespace =
      this.observabilityConfig?.serviceNamespace || "default";
    const serviceVersion = this.observabilityConfig?.serviceVersion || "1.0.0";
    const defaultAttributes = this.observabilityConfig?.defaultAttributes || {};

    return Otlp.layer({
      baseUrl: otlpBaseUrl,
      resource: {
        serviceName: serviceName,
        serviceVersion: serviceVersion,
        attributes: {
          "service.namespace": serviceNamespace,
          "service.instance.id": String(process.pid),
          "deployment.environment": process.env.NODE_ENV ?? "development",
          ...defaultAttributes,
        },
      },
    }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Logger.pretty) // Add pretty logging for consistent output
    );
  }

  /**
   * Get the observability layer for a service
   * Priority: default layer (if enabled) > undefined
   */
  private getObservabilityLayer(
    service: IService | IEffectService
  ): Layer.Layer<never, never, never> | undefined {
    // If observability is enabled in config, create default layer
    if (this.observabilityConfig?.enabled) {
      return this.createDefaultObservabilityLayer(service.name);
    }

    // No observability
    return undefined;
  }

  public addService(
    service: IService | IEffectService,
    config: ServiceConfig = {}
  ): void {
    if (this.managedServices.has(service.name)) {
      throw new Error(`Service with name '${service.name}' already exists`);
    }

    // Get or create observability layer for this service
    const observabilityLayer = this.getObservabilityLayer(service);

    // Create appropriate adapter based on service type
    const adapter = this.isEffectService(service)
      ? new IEffectServiceAdapter(service)
      : new IServiceAdapter(service);

    const managedService: ManagedService = {
      name: service.name,
      adapter,
      config,
      status: "stopped",
      restartCount: 0,
      observabilityLayer, // Store the observability layer on the managed service, not the service itself
    };

    this.managedServices.set(service.name, managedService);

    // Set up scheduled job if configured
    if (config.scheduledJob) {
      this.setupScheduledJob(managedService);
    }
  }

  /**
   * Type guard to check if a service is an IEffectService
   */
  private isEffectService(
    service: IService | IEffectService
  ): service is IEffectService {
    return (
      "startEffect" in service && typeof service.startEffect === "function"
    );
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

    // Handle both IService and IEffectService adapters
    const startEffect =
      managedService.adapter instanceof IEffectServiceAdapter
        ? managedService.adapter.service.startEffect()
        : Effect.gen(function* () {
            yield* Effect.logInfo(`Starting service '${serviceName}'...`);
            yield* Effect.tryPromise({
              try: () => managedService.adapter.start(),
              catch: (e) => {
                console.error(`Error starting service '${serviceName}':`, e);
                return e instanceof Error ? e : new Error(String(e));
              },
            });
            yield* Effect.logInfo(
              `Service '${serviceName}' started successfully`
            );
          }).pipe(
            Effect.withSpan(`${serviceName}_start`, {
              attributes: {
                "service.name": serviceName,
                "service.type": "promise-based",
              },
            })
          );

    // Apply the service-specific observability layer if available
    const startEffectWithObservability = managedService.observabilityLayer
      ? startEffect.pipe(Effect.provide(managedService.observabilityLayer))
      : startEffect;

    return Effect.matchEffect(startEffectWithObservability, {
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

    // Handle both IService and IEffectService adapters
    const stopEffect =
      managedService.adapter instanceof IEffectServiceAdapter
        ? managedService.adapter.service.stopEffect()
        : Effect.gen(function* () {
            yield* Effect.logInfo(`Stopping service '${serviceName}'...`);
            yield* Effect.tryPromise({
              try: () => managedService.adapter.stop(),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            });
            yield* Effect.logInfo(
              `Service '${serviceName}' stopped successfully`
            );
          }).pipe(
            Effect.withSpan(`${serviceName}_stop`, {
              attributes: {
                "service.name": serviceName,
                "service.type": "promise-based",
              },
            })
          );

    // Apply the service-specific observability layer if available
    const stopEffectWithObservability = managedService.observabilityLayer
      ? stopEffect.pipe(Effect.provide(managedService.observabilityLayer))
      : stopEffect;

    return Effect.matchEffect(stopEffectWithObservability, {
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

    // Both adapters have a healthCheck getter that returns an Effect
    const healthCheckEffect = Effect.gen(function* () {
      const serviceHealth = yield* managedService.adapter.healthCheck;
      return {
        ...serviceHealth,
        status: managedService.status, // Use our managed status, not the service's
      };
    });

    // Apply the service-specific observability layer if available
    const healthCheckEffectWithObservability = managedService.observabilityLayer
      ? healthCheckEffect.pipe(
          Effect.provide(managedService.observabilityLayer)
        )
      : healthCheckEffect;

    return healthCheckEffectWithObservability;
  }

  public startAllServicesEffect(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const self = this;

    return Effect.gen(function* () {
      // Filter out services with scheduled jobs - they start automatically via scheduled job fiber
      const manualStartServices = serviceNames.filter((name) => {
        const managed = self.managedServices.get(name);
        return !managed?.config.scheduledJob;
      });

      const scheduledServices = serviceNames.filter((name) => {
        const managed = self.managedServices.get(name);
        return !!managed?.config.scheduledJob;
      });

      yield* Effect.logInfo(
        `Starting ${manualStartServices.length} manual services and ` +
          `${scheduledServices.length} scheduled services (auto-start)`
      );

      // Only start manual services (scheduled services start automatically via their scheduled job fiber)
      const results = yield* Effect.all(
        manualStartServices.map((name) =>
          self.startServiceEffect(name).pipe(
            Effect.tap(() =>
              Effect.logInfo(`Service '${name}' started successfully`)
            ),
            Effect.map(() => ({
              name,
              success: true,
              error: null as Error | null,
            })),
            Effect.catchAll((error) => {
              Effect.logError(`Service '${name}' failed to start`, error);
              return Effect.succeed({
                name,
                success: false,
                error,
              });
            })
          )
        ),
        { concurrency: "unbounded" }
      );

      // Count successful and failed services
      const successfulServices = results.filter(
        (r: { success: boolean }) => r.success
      );
      const failedServices = results.filter(
        (r: { success: boolean }) => !r.success
      );

      yield* Effect.logInfo(
        `Service startup: ${successfulServices.length} successful, ${failedServices.length} failed`
      );

      // Check if any services failed to start
      if (failedServices.length > 0) {
        const errorMessages = failedServices
          .map(
            (f: { name: string; error: Error | null }) =>
              `${f.name}: ${f.error?.message || "Unknown error"}`
          )
          .join(", ");
        yield* Effect.logError(
          `Failed to start ${failedServices.length} services: ${errorMessages}`
        );
        yield* Effect.fail(
          new Error(`Failed to start services: ${errorMessages}`)
        );
      }

      yield* Effect.logInfo(
        `All ${serviceNames.length} services initialized successfully`
      );
    });
  }

  public stopAllServicesEffect(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const stopEffects = serviceNames.map((name) =>
      this.stopServiceEffect(name)
    );

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
    return await Effect.runPromise(this.healthCheckServiceEffect(serviceName));
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
        const serviceEffect =
          managedService.adapter instanceof IEffectServiceAdapter
            ? managedService.adapter.service.startEffect()
            : Effect.tryPromise({
                try: () => managedService.adapter.start(),
                catch: (e) => (e instanceof Error ? e : new Error(String(e))),
              });

        // Apply timeout if configured - race against a sleep + fail
        const timedServiceEffect = timeout
          ? Effect.race(
              serviceEffect,
              Effect.sleep(timeout).pipe(
                Effect.andThen(
                  Effect.fail(
                    new Error(
                      `Service '${name}' timed out after ${Duration.toMillis(timeout)}ms`
                    )
                  )
                )
              )
            )
          : serviceEffect;

        const result = yield* Effect.either(timedServiceEffect);

        // Reset adapter state after each scheduled run to allow next execution
        // This is critical for scheduled jobs that need to run repeatedly
        yield* Effect.promise(() => managedService.adapter.stop());

        if (result._tag === "Left") {
          console.error(
            `Service '${name}' failed in scheduled job:`,
            result.left
          );
          managedService.status = "crashed";
          // Return void to continue scheduling even on failure
          return;
        } else {
          // Service completed successfully
          if (managedService.status === "running") {
            managedService.status = "stopped";
          }
          // Return void to continue scheduling
          return;
        }
      });

      // Apply the service-specific observability layer if available
      const jobEffectWithObservability = managedService.observabilityLayer
        ? jobEffect.pipe(Effect.provide(managedService.observabilityLayer))
        : jobEffect;

      // Use Effect.repeat with the schedule instead of Effect.schedule
      // This ensures the job continues repeating indefinitely
      yield* jobEffectWithObservability.pipe(
        Effect.repeat(schedule),
        Effect.catchAllCause((cause) => {
          console.error(
            `Scheduled job '${name}' encountered fatal error:`,
            cause
          );
          return Effect.void;
        })
      );
    });

    // Fork the scheduled job and store the fiber
    managedService.scheduledJobFiber = Effect.runFork(
      scheduledJobEffect as Effect.Effect<void, never, never>
    );
  }
}
