import { Effect } from "effect";
import type {
  IEffectService,
  AnyServiceError,
  ServiceConfig,
  HealthCheckResult,
  ServiceStatus,
} from "./types";
import { ConsoleLoggingService, ServiceErrors } from "./index";

interface ServiceEntry {
  service: IEffectService;
  config: ServiceConfig;
  status: ServiceStatus;
  restartCount: number;
}

/**
 * Effect-based ServiceManager with fiber supervision and structured concurrency
 */
export class EffectServiceManager {
  private readonly services = new Map<string, ServiceEntry>();
  private readonly logger = new ConsoleLoggingService("ServiceManager");

  /**
   * Get all registered services
   */
  public getServices(): IEffectService[] {
    return Array.from(this.services.values()).map((entry) => entry.service);
  }

  /**
   * Add a service to the manager
   */
  public addService(
    service: IEffectService,
    config: ServiceConfig = {}
  ): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      if (this.services.has(service.name)) {
        throw ServiceErrors.serviceError(
          `Service '${service.name}' is already registered`,
          "ServiceManager"
        );
      }

      this.services.set(service.name, {
        service,
        config,
        status: "stopped",
        restartCount: 0,
      });

      this.logger.info(`Service '${service.name}' registered successfully`);
    });
  }

  /**
   * Remove a service from the manager
   */
  public removeService(
    serviceName: string
  ): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        throw ServiceErrors.serviceError(
          `Service '${serviceName}' not found`,
          "ServiceManager"
        );
      }

      // Stop the service if it's running
      if (entry.status === "running") {
        throw ServiceErrors.serviceError(
          `Cannot remove running service '${serviceName}'. Stop it first.`,
          "ServiceManager"
        );
      }

      this.services.delete(serviceName);
      this.logger.info(`Service '${serviceName}' removed successfully`);
    });
  }

  /**
   * Start a specific service
   */
  public startService(
    serviceName: string
  ): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        throw ServiceErrors.serviceError(
          `Service '${serviceName}' not found`,
          "ServiceManager"
        );
      }

      if (entry.status === "running") {
        this.logger.warn(`Service '${serviceName}' is already running`);
        return;
      }

      this.logger.info(`Starting service '${serviceName}'...`);
    }).pipe(
      Effect.flatMap(() => {
        const entry = this.services.get(serviceName)!;
        return entry.service.start().pipe(
          Effect.map(() => {
            entry.status = "running";
            entry.restartCount = 0;
            this.logger.info(`Service '${serviceName}' started successfully`);
          }),
          Effect.catchAll((error) => {
            entry.status = "crashed";
            this.logger.error(
              `Failed to start service '${serviceName}'`,
              error
            );
            return Effect.fail(error);
          })
        );
      })
    );
  }

  /**
   * Stop a specific service
   */
  public stopService(
    serviceName: string
  ): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        throw ServiceErrors.serviceError(
          `Service '${serviceName}' not found`,
          "ServiceManager"
        );
      }

      if (entry.status === "stopped") {
        this.logger.warn(`Service '${serviceName}' is already stopped`);
        return;
      }

      this.logger.info(`Stopping service '${serviceName}'...`);
    }).pipe(
      Effect.flatMap(() => {
        const entry = this.services.get(serviceName)!;
        return entry.service.stop().pipe(
          Effect.map(() => {
            entry.status = "stopped";
            entry.restartCount = 0;
            this.logger.info(`Service '${serviceName}' stopped successfully`);
          }),
          Effect.catchAll((error) => {
            entry.status = "crashed";
            this.logger.error(`Failed to stop service '${serviceName}'`, error);
            return Effect.fail(error);
          })
        );
      })
    );
  }

  /**
   * Restart a specific service
   */
  public restartService(
    serviceName: string
  ): Effect.Effect<void, AnyServiceError> {
    return this.stopService(serviceName).pipe(
      Effect.flatMap(() => this.startService(serviceName))
    );
  }

  /**
   * Get health check for a specific service
   */
  public healthCheckService(
    serviceName: string
  ): Effect.Effect<HealthCheckResult, AnyServiceError> {
    return Effect.sync(() => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        throw ServiceErrors.serviceError(
          `Service '${serviceName}' not found`,
          "ServiceManager"
        );
      }
    }).pipe(
      Effect.flatMap(() => {
        const entry = this.services.get(serviceName)!;
        return entry.service.healthCheck().pipe(
          Effect.map((health) => ({
            ...health,
            status: entry.status, // Override with manager's status
            details: {
              ...health.details,
              restartCount: entry.restartCount,
              serviceName: entry.service.name,
            },
          }))
        );
      })
    );
  }

  /**
   * Start all services
   */
  public startAllServices(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logger.info("Starting all services...");
    }).pipe(
      Effect.flatMap(() => {
        const serviceNames = Array.from(this.services.keys());

        // Start services sequentially with error handling
        let result: Effect.Effect<void> = Effect.sync(() => {});

        for (const serviceName of serviceNames) {
          result = result.pipe(
            Effect.flatMap(() =>
              this.startService(serviceName).pipe(
                Effect.catchAll((error) => {
                  this.logger.error(
                    `Failed to start service '${serviceName}'`,
                    error
                  );
                  return Effect.sync(() => {}); // Continue with other services
                })
              )
            )
          );
        }

        return result.pipe(
          Effect.map(() => {
            this.logger.info("All services started");
          })
        );
      })
    );
  }

  /**
   * Stop all services
   */
  public stopAllServices(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logger.info("Stopping all services...");
    }).pipe(
      Effect.flatMap(() => {
        const serviceNames = Array.from(this.services.keys()).reverse(); // Stop in reverse order

        // Stop services sequentially with error handling
        let result: Effect.Effect<void> = Effect.sync(() => {});

        for (const serviceName of serviceNames) {
          result = result.pipe(
            Effect.flatMap(() =>
              this.stopService(serviceName).pipe(
                Effect.catchAll((error) => {
                  this.logger.error(
                    `Failed to stop service '${serviceName}'`,
                    error
                  );
                  return Effect.sync(() => {}); // Continue with other services
                })
              )
            )
          );
        }

        return result.pipe(
          Effect.map(() => {
            this.logger.info("All services stopped");
          })
        );
      })
    );
  }

  /**
   * Get health check for all services
   */
  public healthCheckAllServices(): Effect.Effect<
    Record<string, HealthCheckResult>,
    AnyServiceError
  > {
    return Effect.sync(() => {
      const results: Record<string, HealthCheckResult> = {};

      for (const serviceName of this.services.keys()) {
        try {
          const healthResult = Effect.runSync(
            this.healthCheckService(serviceName)
          );
          results[serviceName] = {
            status: "healthy",
            timestamp: Date.now(),
            details: {
              service: serviceName,
              message: "Health check completed",
            },
          };
        } catch (error) {
          results[serviceName] = {
            status: "unhealthy",
            timestamp: Date.now(),
            details: {
              error: error instanceof Error ? error.message : String(error),
              serviceName,
            },
          };
        }
      }

      return results;
    });
  }

  /**
   * Get service status
   */
  public getServiceStatus(
    serviceName: string
  ): Effect.Effect<ServiceStatus, AnyServiceError> {
    return Effect.sync(() => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        throw ServiceErrors.serviceError(
          `Service '${serviceName}' not found`,
          "ServiceManager"
        );
      }
      return entry.status;
    });
  }
}
