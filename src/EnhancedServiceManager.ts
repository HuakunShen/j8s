import { Effect, Option } from "effect";
import type { IService, ServiceConfig, HealthCheckResult } from "./interface";
import type { StructuredServiceError } from "./errors";
import { EnhancedServiceAdapter } from "./EnhancedServiceAdapter";
import { ServiceErrorType } from "./errors";

/**
 * Enhanced service manager that fully leverages Effect's capabilities
 */
export class EnhancedServiceManager {
  private managedServices = new Map<string, ManagedEnhancedService>();

  addService(
    service: IService, 
    config: ServiceConfig = {}
  ): Effect.Effect<void, StructuredServiceError> {
    return Effect.sync(() => {
      const adapter = new EnhancedServiceAdapter(service);
      this.managedServices.set(service.name, {
        name: service.name,
        adapter,
        status: "stopped",
        metrics: {
          errorCount: 0,
          totalRestarts: 0,
        },
        config,
      });
    });
  }

  startService(serviceName: string): Effect.Effect<void, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const managedService = yield* Effect.sync(() => 
        this.managedServices.get(serviceName)
      );
      
      if (!managedService) {
        return yield* Effect.fail({
          type: ServiceErrorType.VALIDATION,
          serviceName,
          operation: "startService",
          message: `Service ${serviceName} not found`,
        } as StructuredServiceError);
      }

      // Use the adapter's startEffect instead of base manager
      yield* managedService.adapter.startEffect;

      // Update status and metrics
      managedService.status = "running";
      managedService.metrics.startTime = new Date();
    });
  }

  healthCheckService(serviceName: string): Effect.Effect<HealthCheckResult, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const managedService = yield* Effect.sync(() => 
        this.managedServices.get(serviceName)
      );
      
      if (!managedService) {
        return yield* Effect.fail({
          type: ServiceErrorType.VALIDATION,
          serviceName,
          operation: "healthCheckService",
          message: `Service ${serviceName} not found`,
        } as StructuredServiceError);
      }

      // Use the adapter's healthCheckEffect
      const health = yield* managedService.adapter.healthCheckEffect;

      return health;
    });
  }

  stopService(serviceName: string): Effect.Effect<void, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const managedService = yield* Effect.sync(() => 
        this.managedServices.get(serviceName)
      );
      
      if (!managedService) {
        return yield* Effect.fail({
          type: ServiceErrorType.VALIDATION,
          serviceName,
          operation: "stopService",
          message: `Service ${serviceName} not found`,
        } as StructuredServiceError);
      }

      // Use the adapter's stopEffect
      yield* managedService.adapter.stopEffect;

      // Update status
      managedService.status = "stopped";
    });
  }

  getServiceMetrics(serviceName: string): Effect.Effect<Record<string, unknown>, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const managedService = yield* Effect.sync(() => 
        this.managedServices.get(serviceName)
      );
      
      if (!managedService) {
        return yield* Effect.fail({
          type: ServiceErrorType.VALIDATION,
          serviceName,
          operation: "getServiceMetrics",
          message: `Service ${serviceName} not found`,
        } as StructuredServiceError);
      }

      return {
        name: managedService.name,
        status: managedService.status,
        ...managedService.metrics,
      };
    });
  }

  restartService(serviceName: string): Effect.Effect<void, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const managedService = yield* Effect.sync(() => 
        this.managedServices.get(serviceName)
      );
      
      if (!managedService) {
        return yield* Effect.fail({
          type: ServiceErrorType.VALIDATION,
          serviceName,
          operation: "restartService",
          message: `Service ${serviceName} not found`,
        } as StructuredServiceError);
      }

      // Use the adapter's restartEffect
      yield* managedService.adapter.restartEffect;

      // Update metrics
      managedService.metrics.totalRestarts += 1;
      managedService.metrics.startTime = new Date();
    });
  }

  healthCheckAllServices(concurrency: number = 3): Effect.Effect<Array<HealthCheckResult>, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const serviceNames = Array.from(this.managedServices.keys());
      
      const healthChecks = serviceNames.map(name => 
        this.healthCheckService(name)
      );
      
      return yield* Effect.all(healthChecks, { concurrency });
    });
  }

  getAllServicesMetrics(): Effect.Effect<Array<Record<string, unknown>>, StructuredServiceError> {
    return Effect.gen(this, function* () {
      const serviceNames = Array.from(this.managedServices.keys());
      
      const metrics = serviceNames.map(name => 
        this.getServiceMetrics(name)
      );
      
      return yield* Effect.all(metrics, { concurrency: 5 });
    });
  }
}

interface ManagedEnhancedService {
  name: string;
  adapter: EnhancedServiceAdapter;
  status: "stopped" | "running" | "crashed";
  metrics: {
    startTime?: Date;
    errorCount: number;
    totalRestarts: number;
  };
  config: ServiceConfig;
}
