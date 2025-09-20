import { Effect, Fiber } from "effect";
import type {
  IEffectService,
  AnyServiceError,
  ServiceConfig,
  HealthCheckResult,
  ServiceStatus,
} from "./types";
import {
  ConsoleLoggingService,
  ServiceErrors,
  ConfigUtils,
  retryWithConfig,
} from "./index";

/**
 * Abstract base class for Effect-based services with built-in:
 * - Structured concurrency
 * - Health checks
 * - Resource management
 * - Graceful shutdown
 */
export abstract class EffectBaseService implements IEffectService {
  public readonly name: string;
  protected readonly config: ServiceConfig;
  protected logger: ConsoleLoggingService;

  // Service state management
  private _status: ServiceStatus = "stopped";
  private _shutdownRequested = false;

  constructor(name: string, config: ServiceConfig = {}) {
    this.name = name;
    this.config = config;
    this.logger = new ConsoleLoggingService(name);
  }

  /**
   * Start the service
   */
  public start(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logger.info(`Starting service ${this.name}...`);

      // Validate config
      if (
        this.config.retry &&
        !ConfigUtils.validateRetryConfig(this.config.retry)
      ) {
        throw ServiceErrors.serviceError(
          "Invalid retry configuration",
          this.name,
          new Error("Retry configuration validation failed")
        );
      }

      // Mark service as starting
      this._status = "running";
      this._shutdownRequested = false;
    }).pipe(
      Effect.flatMap(() => this.doStart()),
      Effect.map(() => {
        this.logger.info(`Service ${this.name} started successfully`);
      })
    );
  }

  /**
   * Stop the service with graceful shutdown
   */
  public stop(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logger.info(`Stopping service ${this.name}...`);
      this._shutdownRequested = true;
      this._status = "stopping";
    }).pipe(
      Effect.flatMap(() => this.doStop()),
      Effect.map(() => {
        this._status = "stopped";
        this.logger.info(`Service ${this.name} stopped successfully`);
      })
    );
  }

  /**
   * Health check with service state monitoring
   */
  public healthCheck(): Effect.Effect<HealthCheckResult, AnyServiceError> {
    return this.doHealthCheck().pipe(
      Effect.map((customHealth) => ({
        ...customHealth,
        status: this._status,
        timestamp: Date.now(),
        details: {
          ...customHealth.details,
          service: this.name,
          shutdownRequested: this._shutdownRequested,
        },
      }))
    );
  }

  /**
   * Get current service status
   */
  public get status(): ServiceStatus {
    return this._status;
  }

  /**
   * Check if service is running
   */
  public get isRunning(): boolean {
    return this._status === "running";
  }

  /**
   * Check if shutdown was requested
   */
  public get shutdownRequested(): boolean {
    return this._shutdownRequested;
  }

  /**
   * Abstract method - implement service-specific start logic
   */
  protected abstract doStart(): Effect.Effect<void, AnyServiceError>;

  /**
   * Abstract method - implement service-specific stop logic
   */
  protected abstract doStop(): Effect.Effect<void, AnyServiceError>;

  /**
   * Abstract method - implement service-specific health check
   */
  protected abstract doHealthCheck(): Effect.Effect<
    HealthCheckResult,
    AnyServiceError
  >;

  /**
   * Helper method for logging with service context
   */
  protected logWithContext(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    metadata?: Record<string, unknown>
  ): Effect.Effect<void> {
    const context = {
      service: this.name,
      status: this._status,
      ...metadata,
    };

    switch (level) {
      case "info":
        return this.logger.info(message, context);
      case "warn":
        return this.logger.warn(message, context);
      case "error":
        return this.logger.error(message, undefined, context);
      case "debug":
        return this.logger.debug(message, context);
    }
  }

  /**
   * Check if shutdown was requested and fail if so
   */
  protected checkShutdown(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      if (this._shutdownRequested) {
        throw ServiceErrors.serviceError("Shutdown requested", this.name);
      }
    });
  }
}
