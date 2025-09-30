import { Effect, Option, Fiber } from "effect";
import type { IService, HealthCheckResult } from "./interface";
import { StructuredServiceError, ServiceErrorType } from "./errors";

/**
 * Enhanced adapter that fully leverages Effect's capabilities
 */
export class EnhancedServiceAdapter {
  readonly startEffect: Effect.Effect<void, StructuredServiceError>;
  readonly stopEffect: Effect.Effect<void, StructuredServiceError>;
  readonly healthCheckEffect: Effect.Effect<HealthCheckResult, StructuredServiceError>;
  readonly restartEffect: Effect.Effect<void, StructuredServiceError>;
  
  private fiber: Fiber.RuntimeFiber<void, StructuredServiceError> | null = null;
  private isStarted = false;

  constructor(public readonly service: IService) {
    this.startEffect = Effect.gen(function* () {
      yield* Effect.logInfo(`Starting service ${service.name}`);
      yield* Effect.tryPromise({
        try: () => service.start(),
        catch: (e) => new StructuredServiceError(
          ServiceErrorType.STARTUP,
          service.name,
          "start",
          e instanceof Error ? e.message : String(e),
          e instanceof Error ? e : undefined
        )
      });
    });

    this.stopEffect = Effect.gen(function* () {
      yield* Effect.logInfo(`Stopping service ${service.name}`);
      yield* Effect.tryPromise({
        try: () => service.stop(),
        catch: (e) => new StructuredServiceError(
          ServiceErrorType.SHUTDOWN,
          service.name,
          "stop",
          e instanceof Error ? e.message : String(e),
          e instanceof Error ? e : undefined
        )
      });
    });

    this.healthCheckEffect = Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => service.healthCheck(),
        catch: (e) => new StructuredServiceError(
          ServiceErrorType.HEALTH_CHECK,
          service.name,
          "healthCheck",
          e instanceof Error ? e.message : String(e),
          e instanceof Error ? e : undefined
        )
      });
      return result;
    });

    this.restartEffect = Effect.gen(function* () {
      yield* Effect.logInfo(`Restarting service ${service.name}`);
      yield* Effect.andThen(
        Effect.logInfo(`Stopping service ${service.name}`),
        Effect.andThen(
          Effect.tryPromise({
            try: () => service.stop(),
            catch: (e) => new StructuredServiceError(
              ServiceErrorType.SHUTDOWN,
              service.name,
              "stop",
              e instanceof Error ? e.message : String(e),
              e instanceof Error ? e : undefined
            )
          }),
          Effect.andThen(
            Effect.logInfo(`Starting service ${service.name}`),
            Effect.tryPromise({
              try: () => service.start(),
              catch: (e) => new StructuredServiceError(
                ServiceErrorType.STARTUP,
                service.name,
                "start",
                e instanceof Error ? e.message : String(e),
                e instanceof Error ? e : undefined
              )
            })
          )
        )
      );
    });
  }

  /**
   * Start the service with proper resource management
   */
  startWithResourceManagement(): Effect.Effect<void, StructuredServiceError> {
    const self = this;
    return Effect.gen(function* () {
      yield* self.startEffect;
      self.isStarted = true;
    });
  }

  /**
   * Start the service as a background fiber
   */
  startAsFiber(): Effect.Effect<Fiber.RuntimeFiber<void, StructuredServiceError>, StructuredServiceError> {
    const self = this;
    return Effect.gen(function* () {
      const fiber = yield* Effect.fork(self.startEffect);
      self.fiber = fiber;
      self.isStarted = true;
      return fiber;
    });
  }

  /**
   * Get the current service fiber if running
   */
  getFiber(): Option.Option<Fiber.RuntimeFiber<void, StructuredServiceError>> {
    return this.fiber ? Option.some(this.fiber) : Option.none();
  }

  /**
   * Stop the service fiber if running
   */
  stopFiber(): Effect.Effect<void, never> {
    const self = this;
    return Effect.gen(function* () {
      if (self.fiber) {
        yield* Fiber.interrupt(self.fiber);
        self.fiber = null;
        self.isStarted = false;
      }
    });
  }

  /**
   * Check if the service is currently running
   */
  isRunning(): boolean {
    return this.isStarted;
  }
}
