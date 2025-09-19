import { Effect, Clock, Ref, Scope } from "effect";
import type { 
  EffectService, 
  EffectServiceConfig, 
  EffectHealthStatus
} from "./interfaces";
import { ServiceContext } from "./interfaces";
import type { HealthCheckResult } from "../interface";
import { StartupError, ShutdownError, HealthCheckError } from "./errors";

/**
 * Abstract base class for Effect-based services
 */
export abstract class BaseEffectService implements EffectService {
  public readonly name: string;
  public readonly config: EffectServiceConfig;
  
  protected readonly startTime = Ref.unsafeMake<Date | null>(null);
  protected readonly isRunning = Ref.unsafeMake<boolean>(false);
  protected readonly restartCount = Ref.unsafeMake<number>(0);
  protected readonly errorCount = Ref.unsafeMake<number>(0);
  protected readonly successCount = Ref.unsafeMake<number>(0);

  constructor(name: string, config: EffectServiceConfig = {}) {
    this.name = name;
    this.config = config;
  }

  /**
   * Abstract method to be implemented by concrete services
   */
  protected abstract runService(): Effect.Effect<void, StartupError, ServiceContext>;

  /**
   * Abstract method for service cleanup
   */
  protected abstract cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext>;

  /**
   * Start the service with Effect error handling and observability
   */
  public readonly start = (): Effect.Effect<void, StartupError, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      // Check if already running
      const running = yield* Ref.get(this.isRunning);
      if (running) {
        return yield* Effect.fail(new StartupError({
          message: `Service '${this.name}' is already running`,
          phase: "initialization"
        }));
      }

      // Record start time and set running state
      const now = yield* Clock.currentTimeMillis.pipe(Effect.map(ms => new Date(ms)));
      yield* Ref.set(this.startTime, now);
      yield* Ref.set(this.isRunning, true);

      try {
        // Run with observability if enabled
        if (this.config.observability?.enableTracing) {
          yield* context.observabilityManager.trace(
            `service.start.${this.name}`,
            this.runService()
          );
        } else {
          yield* this.runService();
        }

        // Increment success counter
        yield* Ref.update(this.successCount, n => n + 1);

        // Record metrics if enabled
        if (this.config.observability?.enableMetrics) {
          yield* context.observabilityManager.incrementCounter(
            "service.start.success",
            { service: this.name, ...this.config.observability.tags }
          );
        }

      } catch (error) {
        // Update error count and set not running
        yield* Ref.update(this.errorCount, n => n + 1);
        yield* Ref.set(this.isRunning, false);
        
        // Record error metrics
        if (this.config.observability?.enableMetrics) {
          yield* context.observabilityManager.incrementCounter(
            "service.start.error",
            { service: this.name, error: String(error) }
          );
        }

        return yield* Effect.fail(new StartupError({
          message: `Failed to start service '${this.name}': ${String(error)}`,
          phase: "execution",
          cause: error
        }));
      }
    });

  /**
   * Stop the service with proper cleanup
   */
  public readonly stop = (): Effect.Effect<void, ShutdownError, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;

      // Check if already stopped
      const running = yield* Ref.get(this.isRunning);
      if (!running) {
        return; // Already stopped, no-op
      }

      // Set stopping state
      yield* Ref.set(this.isRunning, false);

      try {
        // Run cleanup with timeout if configured
        const cleanupEffect = this.config.timeout 
          ? Effect.timeout(this.cleanupService(), this.config.timeout)
          : this.cleanupService();

        if (this.config.observability?.enableTracing) {
          yield* context.observabilityManager.trace(
            `service.stop.${this.name}`,
            cleanupEffect
          );
        } else {
          yield* cleanupEffect;
        }

        // Record success metrics
        if (this.config.observability?.enableMetrics) {
          yield* context.observabilityManager.incrementCounter(
            "service.stop.success",
            { service: this.name }
          );
        }

      } catch (error) {
        // Record error metrics
        if (this.config.observability?.enableMetrics) {
          yield* context.observabilityManager.incrementCounter(
            "service.stop.error",
            { service: this.name, error: String(error) }
          );
        }

        return yield* Effect.fail(new ShutdownError({
          message: `Failed to stop service '${this.name}': ${String(error)}`,
          timeout: false,
          cause: error
        }));
      }
    });

  /**
   * Restart the service (composed stop + start operation)
   */
  public readonly restart = (): Effect.Effect<void, StartupError | ShutdownError, ServiceContext> =>
    Effect.gen(this, function* () {
      // Increment restart count
      yield* Ref.update(this.restartCount, n => n + 1);
      
      // Stop then start
      yield* this.stop();
      yield* this.start();
    });

  /**
   * Perform health check with service-specific details
   */
  public readonly healthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError, ServiceContext> =>
    Effect.gen(this, function* () {
      try {
        const running = yield* Ref.get(this.isRunning);
        const startTimeValue = yield* Ref.get(this.startTime);
        const restartCountValue = yield* Ref.get(this.restartCount);
        const errorCountValue = yield* Ref.get(this.errorCount);
        const successCountValue = yield* Ref.get(this.successCount);
        
        const now = yield* Clock.currentTimeMillis.pipe(Effect.map(ms => new Date(ms)));
        const uptime = startTimeValue ? now.getTime() - startTimeValue.getTime() : 0;

        const healthStatus: EffectHealthStatus = {
          status: running ? "running" : "stopped",
          lastHealthCheck: now,
          restartCount: restartCountValue,
          uptime,
          metrics: {
            errorCount: errorCountValue,
            successCount: successCountValue,
            startupTime: startTimeValue?.getTime()
          },
          details: {
            name: this.name,
            config: this.config,
            isRunning: running
          }
        };

        return healthStatus;

      } catch (error) {
        return yield* Effect.fail(new HealthCheckError({
          message: `Health check failed for service '${this.name}': ${String(error)}`,
          cause: error
        }));
      }
    });

  /**
   * Get service-specific custom health details
   * Override this method in concrete services for custom health checks
   */
  protected getCustomHealthDetails(): Effect.Effect<Record<string, any>, never, ServiceContext> {
    return Effect.succeed({});
  }
}