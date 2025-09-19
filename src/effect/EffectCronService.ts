import { Effect, Schedule, Ref, Clock, pipe } from "effect";
import { CronJob } from "cron";
import { BaseEffectService } from "./BaseEffectService";
import type { 
  EffectServiceConfig, 
  ServiceContext,
  EffectHealthStatus 
} from "./interfaces";
import type { HealthCheckResult, CronJobConfig } from "../interface";
import { StartupError, ShutdownError, ScheduleError, HealthCheckError } from "./errors";

/**
 * Enhanced cron configuration with Effect-specific options
 */
export interface EffectCronConfig extends CronJobConfig {
  readonly timezone?: string;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly runOnInit?: boolean;
  readonly maxExecutions?: number;
  readonly overlapPolicy?: "skip" | "queue" | "terminate";
  readonly errorPolicy?: "continue" | "stop" | "retry";
  readonly retryAttempts?: number;
}

/**
 * Cron execution context for tracking state
 */
interface CronExecutionContext {
  readonly executionCount: Ref.Ref<number>;
  readonly lastExecution: Ref.Ref<Date | null>;
  readonly nextExecution: Ref.Ref<Date | null>;
  readonly isExecuting: Ref.Ref<boolean>;
  readonly consecutiveErrors: Ref.Ref<number>;
  readonly totalErrors: Ref.Ref<number>;
  readonly cronJob: Ref.Ref<CronJob | null>;
}

/**
 * Abstract base class for Effect-based cron services
 */
export abstract class EffectCronService extends BaseEffectService {
  protected readonly cronConfig: EffectCronConfig;
  protected readonly executionContext: CronExecutionContext;

  constructor(
    name: string, 
    cronConfig: EffectCronConfig,
    serviceConfig: EffectServiceConfig = {}
  ) {
    super(name, serviceConfig);
    this.cronConfig = cronConfig;
    this.executionContext = {
      executionCount: Ref.unsafeMake(0),
      lastExecution: Ref.unsafeMake(null),
      nextExecution: Ref.unsafeMake(null),
      isExecuting: Ref.unsafeMake(false),
      consecutiveErrors: Ref.unsafeMake(0),
      totalErrors: Ref.unsafeMake(0),
      cronJob: Ref.unsafeMake(null)
    };
  }

  /**
   * Abstract method to be implemented by concrete cron services
   * This method defines the work to be done on each cron execution
   */
  protected abstract executeTask(): Effect.Effect<void, Error, ServiceContext>;

  /**
   * Validate cron expression and configuration
   */
  private readonly validateCronConfig = (): Effect.Effect<void, ScheduleError, never> =>
    Effect.gen(this, function* () {
      try {
        // Validate cron expression by creating a test CronJob
        const testJob = new CronJob(
          this.cronConfig.schedule,
          () => {}, // empty function
          null, // onComplete
          false, // start
          this.cronConfig.timezone
        );
        
        // Validate other config options
        if (this.cronConfig.maxExecutions && this.cronConfig.maxExecutions < 1) {
          return yield* Effect.fail(new ScheduleError({
            message: "maxExecutions must be greater than 0",
            cronExpression: this.cronConfig.schedule
          }));
        }

        if (this.cronConfig.startTime && this.cronConfig.endTime && 
            this.cronConfig.startTime >= this.cronConfig.endTime) {
          return yield* Effect.fail(new ScheduleError({
            message: "startTime must be before endTime",
            cronExpression: this.cronConfig.schedule
          }));
        }

      } catch (error) {
        return yield* Effect.fail(new ScheduleError({
          message: `Invalid cron expression: ${String(error)}`,
          cronExpression: this.cronConfig.schedule,
          cause: error
        }));
      }
    });

  /**
   * Create and configure the cron job
   */
  private readonly createCronJob = (): Effect.Effect<CronJob, ScheduleError, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      const cronJob = new CronJob(
        this.cronConfig.schedule,
        () => {
          // Execute the cron task using Effect runtime
          Effect.runFork(this.executeCronTask().pipe(
            Effect.provide(context)
          ));
        },
        null, // onComplete
        false, // don't start immediately
        this.cronConfig.timezone
      );

      // Calculate next execution time
      const nextExecution = cronJob.nextDate();
      if (nextExecution) {
        yield* Ref.set(this.executionContext.nextExecution, nextExecution.toJSDate());
      }

      return cronJob;
    });

  /**
   * Execute the cron task with error handling and overlap prevention
   */
  private readonly executeCronTask = (): Effect.Effect<void, never, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      // Check if service is still running
      const running = yield* Ref.get(this.isRunning);
      if (!running) {
        return;
      }

      // Handle overlap based on policy
      const isExecuting = yield* Ref.get(this.executionContext.isExecuting);
      if (isExecuting) {
        switch (this.cronConfig.overlapPolicy) {
          case "skip":
            console.log(`Skipping execution of ${this.name} - previous execution still running`);
            return;
          case "queue":
            // Wait for current execution to complete
            yield* Effect.repeat(
              Effect.gen(this, function* () {
                const stillExecuting = yield* Ref.get(this.executionContext.isExecuting);
                if (!stillExecuting) {
                  return Effect.unit;
                }
                return yield* Effect.fail("still-executing");
              }),
              Schedule.fixed(100) // Check every 100ms
            );
            break;
          case "terminate":
            // This would require keeping track of the execution fiber
            console.warn(`Terminating previous execution of ${this.name}`);
            break;
        }
      }

      // Check execution limits
      const executionCount = yield* Ref.get(this.executionContext.executionCount);
      if (this.cronConfig.maxExecutions && executionCount >= this.cronConfig.maxExecutions) {
        console.log(`Service ${this.name} reached maximum executions (${this.cronConfig.maxExecutions})`);
        yield* this.stop();
        return;
      }

      // Check time bounds
      const now = yield* Clock.currentTimeMillis.pipe(Effect.map(ms => new Date(ms)));
      if (this.cronConfig.startTime && now < this.cronConfig.startTime) {
        return;
      }
      if (this.cronConfig.endTime && now > this.cronConfig.endTime) {
        yield* this.stop();
        return;
      }

      // Set executing state
      yield* Ref.set(this.executionContext.isExecuting, true);
      yield* Ref.update(this.executionContext.executionCount, n => n + 1);
      yield* Ref.set(this.executionContext.lastExecution, now);

      try {
        // Execute with timeout if configured
        const taskEffect = this.cronConfig.timeout
          ? Effect.timeout(this.executeTask(), this.cronConfig.timeout)
          : this.executeTask();

        // Add observability if enabled
        const tracedTaskEffect = this.config.observability?.enableTracing
          ? context.observabilityManager.trace(`cron.execute.${this.name}`, taskEffect)
          : taskEffect;

        yield* tracedTaskEffect;

        // Reset consecutive errors on success
        yield* Ref.set(this.executionContext.consecutiveErrors, 0);

        // Record success metrics
        if (this.config.observability?.enableMetrics) {
          yield* context.observabilityManager.incrementCounter(
            "cron.execution.success",
            { service: this.name, schedule: this.cronConfig.schedule }
          );
        }

      } catch (error) {
        yield* this.handleExecutionError(error);
      } finally {
        // Update next execution time
        const cronJob = yield* Ref.get(this.executionContext.cronJob);
        if (cronJob) {
          const nextExecution = cronJob.nextDate();
          if (nextExecution) {
            yield* Ref.set(this.executionContext.nextExecution, nextExecution.toJSDate());
          }
        }

        // Clear executing state
        yield* Ref.set(this.executionContext.isExecuting, false);
      }
    });

  /**
   * Handle execution errors according to error policy
   */
  private readonly handleExecutionError = (error: unknown): Effect.Effect<void, never, ServiceContext> =>
    Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Ref.update(this.executionContext.consecutiveErrors, n => n + 1);
      yield* Ref.update(this.executionContext.totalErrors, n => n + 1);
      
      const consecutiveErrors = yield* Ref.get(this.executionContext.consecutiveErrors);
      
      console.error(`Cron task execution failed for ${this.name}:`, error);

      // Record error metrics
      if (this.config.observability?.enableMetrics) {
        yield* context.observabilityManager.incrementCounter(
          "cron.execution.error",
          { 
            service: this.name, 
            schedule: this.cronConfig.schedule,
            error: String(error)
          }
        );
      }

      // Handle according to error policy
      switch (this.cronConfig.errorPolicy) {
        case "stop":
          console.log(`Stopping ${this.name} due to execution error`);
          yield* this.stop();
          break;
        
        case "retry":
          const retryAttempts = this.cronConfig.retryAttempts ?? 3;
          if (consecutiveErrors <= retryAttempts) {
            console.log(`Retrying task for ${this.name} (attempt ${consecutiveErrors}/${retryAttempts})`);
            // The retry will happen on the next scheduled execution
          } else {
            console.log(`${this.name} exceeded retry attempts, stopping service`);
            yield* this.stop();
          }
          break;
        
        case "continue":
        default:
          // Continue with next scheduled execution
          break;
      }
    });

  /**
   * Start the cron service
   */
  protected readonly runService = (): Effect.Effect<void, StartupError, ServiceContext> =>
    Effect.gen(this, function* () {
      // Validate configuration
      yield* this.validateCronConfig().pipe(
        Effect.mapError(error => new StartupError({
          message: `Cron configuration validation failed: ${error.message}`,
          phase: "initialization",
          cause: error
        }))
      );

      // Create and start cron job
      const cronJob = yield* this.createCronJob().pipe(
        Effect.mapError(error => new StartupError({
          message: `Failed to create cron job: ${error.message}`,
          phase: "initialization",
          cause: error
        }))
      );

      yield* Ref.set(this.executionContext.cronJob, cronJob);

      // Run initial execution if configured
      if (this.cronConfig.runOnInit) {
        yield* Effect.fork(this.executeCronTask());
      }

      // Start the cron job
      cronJob.start();

      console.log(`Cron service ${this.name} started with schedule: ${this.cronConfig.schedule}`);

      // Keep running until stopped
      yield* Effect.never;
    });

  /**
   * Stop the cron service
   */
  protected readonly cleanupService = (): Effect.Effect<void, ShutdownError, ServiceContext> =>
    Effect.gen(this, function* () {
      const cronJob = yield* Ref.get(this.executionContext.cronJob);
      
      if (cronJob) {
        // Stop the cron job
        cronJob.stop();
        
        // Wait for any running execution to complete
        const isExecuting = yield* Ref.get(this.executionContext.isExecuting);
        if (isExecuting) {
          yield* Effect.repeat(
            Effect.gen(this, function* () {
              const stillExecuting = yield* Ref.get(this.executionContext.isExecuting);
              if (!stillExecuting) {
                return Effect.unit;
              }
              return yield* Effect.fail("still-executing");
            }),
            pipe(
              Schedule.fixed(100),
              Schedule.compose(Schedule.upTo(this.config.timeout ?? 5000))
            )
          );
        }
        
        yield* Ref.set(this.executionContext.cronJob, null);
      }

      console.log(`Cron service ${this.name} stopped`);
    });

  /**
   * Enhanced health check with cron-specific details
   */
  public override readonly healthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError, ServiceContext> =>
    Effect.gen(this, function* () {
      // Get base health status
      const baseHealth = yield* super.healthCheck();
      
      const executionCount = yield* Ref.get(this.executionContext.executionCount);
      const lastExecution = yield* Ref.get(this.executionContext.lastExecution);
      const nextExecution = yield* Ref.get(this.executionContext.nextExecution);
      const isExecuting = yield* Ref.get(this.executionContext.isExecuting);
      const consecutiveErrors = yield* Ref.get(this.executionContext.consecutiveErrors);
      const totalErrors = yield* Ref.get(this.executionContext.totalErrors);

      // Enhance with cron-specific details
      const cronHealth: EffectHealthStatus = {
        ...baseHealth,
        details: {
          ...baseHealth.details,
          isCronService: true,
          cronConfig: this.cronConfig,
          executionCount,
          lastExecution,
          nextExecution,
          isExecuting,
          consecutiveErrors,
          totalErrors,
          errorRate: executionCount > 0 ? totalErrors / executionCount : 0
        }
      };

      return cronHealth;
    });
}