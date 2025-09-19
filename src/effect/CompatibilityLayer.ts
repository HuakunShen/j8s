/**
 * Compatibility Layer for j8s Effect Integration
 * 
 * This module provides a compatibility layer that allows existing j8s services
 * to work with the new Effect-based system without requiring immediate migration.
 * It also provides utilities to gradually migrate from the old system to the new one.
 */

import { Effect, Layer, Context, Runtime, Ref } from "effect";
import type { 
  IService, 
  IServiceManager, 
  ServiceConfig, 
  HealthCheckResult, 
  RestartPolicy
} from "../interface";
import { ServiceManager } from "../ServiceManager";
import { BaseService } from "../BaseService";
import { WorkerService } from "../WorkerService";
import type { 
  EffectService, 
  EffectServiceManager, 
  EffectServiceConfig,
  ServiceContext,
  RetryPolicy
} from "./interfaces";
import { BaseEffectService } from "./BaseEffectService";
import { EffectWorkerService } from "./EffectWorkerService";
import { EffectServiceManagerLive, ServiceContextLive } from "./EffectServiceManager";
import { makeObservabilityLayer, defaultObservabilityConfig } from "./Observability";
import { StartupError, ShutdownError } from "./errors";

/**
 * Adapter that wraps traditional IService to work with Effect system
 */
export class LegacyServiceAdapter extends BaseEffectService {
  private readonly legacyService: IService;
  private readonly isRunning = Ref.unsafeMake<boolean>(false);

  constructor(legacyService: IService, config: EffectServiceConfig = {}) {
    super(legacyService.name, config);
    this.legacyService = legacyService;
  }

  protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
    return Effect.gen(this, function* () {
      try {
        yield* Ref.set(this.isRunning, true);
        yield* Effect.promise(() => this.legacyService.start());
        
        // For long-running services, keep the effect alive
        yield* Effect.never;
        
      } catch (error) {
        yield* Ref.set(this.isRunning, false);
        return yield* Effect.fail(new StartupError({
          message: `Legacy service startup failed: ${String(error)}`,
          phase: "execution",
          cause: error
        }));
      }
    });
  }

  protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
    return Effect.gen(this, function* () {
      try {
        yield* Effect.promise(() => this.legacyService.stop());
        yield* Ref.set(this.isRunning, false);
        
      } catch (error) {
        return yield* Effect.fail(new ShutdownError({
          message: `Legacy service shutdown failed: ${String(error)}`,
          timeout: false,
          cause: error
        }));
      }
    });
  }

  public override readonly healthCheck = (): Effect.Effect<HealthCheckResult, never, ServiceContext> =>
    Effect.gen(this, function* () {
      try {
        const legacyHealth = yield* Effect.promise(() => this.legacyService.healthCheck());
        const running = yield* Ref.get(this.isRunning);
        
        return {
          ...legacyHealth,
          status: running ? "running" : "stopped",
          details: {
            ...legacyHealth.details,
            isLegacyService: true,
            wrappedService: this.legacyService.constructor.name
          }
        };
        
      } catch (error) {
        return {
          status: "unhealthy",
          details: {
            isLegacyService: true,
            error: String(error)
          }
        };
      }
    });
}

/**
 * Adapter that makes Effect services work with traditional ServiceManager
 */
export class EffectServiceAdapter implements IService {
  public readonly name: string;
  private readonly effectService: EffectService;
  private readonly runtime: Runtime.Runtime<ServiceContext>;

  constructor(effectService: EffectService, runtime: Runtime.Runtime<ServiceContext>) {
    this.name = effectService.name;
    this.effectService = effectService;
    this.runtime = runtime;
  }

  async start(): Promise<void> {
    return Runtime.runPromise(this.runtime)(this.effectService.start());
  }

  async stop(): Promise<void> {
    return Runtime.runPromise(this.runtime)(this.effectService.stop());
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return Runtime.runPromise(this.runtime)(this.effectService.healthCheck());
  }
}

/**
 * Hybrid service manager that can manage both legacy and Effect services
 */
export class HybridServiceManager implements IServiceManager {
  private readonly legacyManager: ServiceManager;
  private readonly effectManager: EffectServiceManager;
  private readonly runtime: Runtime.Runtime<ServiceContext>;

  constructor(runtime: Runtime.Runtime<ServiceContext>, effectManager: EffectServiceManager) {
    this.legacyManager = new ServiceManager();
    this.effectManager = effectManager;
    this.runtime = runtime;
  }

  get services(): IService[] {
    // Combine services from both managers
    const legacyServices = this.legacyManager.services;
    const effectServices = Runtime.runSync(this.runtime)(this.effectManager.services);
    const adaptedEffectServices = effectServices.map(service => 
      new EffectServiceAdapter(service, this.runtime)
    );
    
    return [...legacyServices, ...adaptedEffectServices];
  }

  addService(service: IService, config?: ServiceConfig): void {
    // Determine if this is an Effect service or legacy service
    if (this.isEffectService(service)) {
      // Convert legacy config to Effect config and add to Effect manager
      const effectConfig = this.convertLegacyConfig(config);
      Runtime.runSync(this.runtime)(
        this.effectManager.addService(service as any).pipe(
          Effect.catchAll(() => Effect.unit) // Ignore errors for compatibility
        )
      );
    } else {
      // Add to legacy manager
      this.legacyManager.addService(service, config);
    }
  }

  removeService(serviceName: string): void {
    // Try to remove from both managers
    try {
      this.legacyManager.removeService(serviceName);
    } catch {
      // Ignore if not found in legacy manager
    }
    
    try {
      Runtime.runSync(this.runtime)(
        this.effectManager.removeService(serviceName).pipe(
          Effect.catchAll(() => Effect.unit)
        )
      );
    } catch {
      // Ignore if not found in Effect manager
    }
  }

  async startService(serviceName: string): Promise<void> {
    // Try legacy manager first
    try {
      await this.legacyManager.startService(serviceName);
      return;
    } catch {
      // If not found in legacy, try Effect manager
    }
    
    return Runtime.runPromise(this.runtime)(
      this.effectManager.startService(serviceName).pipe(
        Effect.catchAll(() => Effect.fail(new Error(`Service '${serviceName}' not found`)))
      )
    );
  }

  async stopService(serviceName: string): Promise<void> {
    // Try legacy manager first
    try {
      await this.legacyManager.stopService(serviceName);
      return;
    } catch {
      // If not found in legacy, try Effect manager
    }
    
    return Runtime.runPromise(this.runtime)(
      this.effectManager.stopService(serviceName).pipe(
        Effect.catchAll(() => Effect.fail(new Error(`Service '${serviceName}' not found`)))
      )
    );
  }

  async restartService(serviceName: string): Promise<void> {
    // Try legacy manager first
    try {
      await this.legacyManager.restartService(serviceName);
      return;
    } catch {
      // If not found in legacy, try Effect manager
    }
    
    return Runtime.runPromise(this.runtime)(
      this.effectManager.restartService(serviceName).pipe(
        Effect.catchAll(() => Effect.fail(new Error(`Service '${serviceName}' not found`)))
      )
    );
  }

  async healthCheckService(serviceName: string): Promise<HealthCheckResult> {
    // Try legacy manager first
    try {
      return await this.legacyManager.healthCheckService(serviceName);
    } catch {
      // If not found in legacy, try Effect manager
    }
    
    return Runtime.runPromise(this.runtime)(
      this.effectManager.healthCheckService(serviceName).pipe(
        Effect.catchAll(() => Effect.fail(new Error(`Service '${serviceName}' not found`)))
      )
    );
  }

  async startAllServices(): Promise<void> {
    // Start legacy services
    await this.legacyManager.startAllServices();
    
    // Start Effect services
    await Runtime.runPromise(this.runtime)(
      this.effectManager.startAllServices().pipe(
        Effect.catchAll(() => Effect.unit)
      )
    );
  }

  async stopAllServices(): Promise<void> {
    // Stop both legacy and Effect services
    await Promise.allSettled([
      this.legacyManager.stopAllServices(),
      Runtime.runPromise(this.runtime)(
        this.effectManager.stopAllServices().pipe(
          Effect.catchAll(() => Effect.unit)
        )
      )
    ]);
  }

  async healthCheckAllServices(): Promise<Record<string, HealthCheckResult>> {
    const [legacyHealth, effectHealth] = await Promise.allSettled([
      this.legacyManager.healthCheckAllServices(),
      Runtime.runPromise(this.runtime)(
        this.effectManager.healthCheckAllServices().pipe(
          Effect.catchAll(() => Effect.succeed({}))
        )
      )
    ]);

    const result: Record<string, HealthCheckResult> = {};
    
    if (legacyHealth.status === "fulfilled") {
      Object.assign(result, legacyHealth.value);
    }
    
    if (effectHealth.status === "fulfilled") {
      Object.assign(result, effectHealth.value);
    }
    
    return result;
  }

  private isEffectService(service: IService): boolean {
    // Check if the service is an Effect service by looking for Effect-specific properties
    return service instanceof BaseEffectService || 
           service instanceof EffectWorkerService ||
           'config' in service && typeof (service as any).config === 'object';
  }

  private convertLegacyConfig(config?: ServiceConfig): EffectServiceConfig {
    if (!config) return {};
    
    const effectConfig: EffectServiceConfig = {
      restartPolicy: config.restartPolicy,
      cronJob: config.cronJob,
      timeout: config.cronJob?.timeout
    };

    // Convert retry policy
    if (config.restartPolicy === "on-failure" && config.maxRetries) {
      effectConfig.retryPolicy = {
        type: "exponential",
        maxRetries: config.maxRetries,
        baseDelay: 1000,
        factor: 2
      };
    }

    return effectConfig;
  }
}

/**
 * Migration utilities for gradually moving from legacy to Effect system
 */
export class MigrationUtilities {
  /**
   * Wrap a legacy service to make it work with Effect system
   */
  static wrapLegacyService(service: IService, config?: EffectServiceConfig): EffectService {
    return new LegacyServiceAdapter(service, config);
  }

  /**
   * Create a hybrid manager that supports both legacy and Effect services
   */
  static createHybridManager(): Effect.Effect<HybridServiceManager, never, ServiceContext> {
    return Effect.gen(function* () {
      const effectManager = yield* EffectServiceManager;
      const context = yield* ServiceContext;
      const runtime = Runtime.defaultRuntime.pipe(Runtime.provide(context));
      
      return new HybridServiceManager(runtime, effectManager);
    });
  }

  /**
   * Migrate a legacy BaseService to Effect-based service
   */
  static migrateBaseService<T extends BaseService>(
    LegacyClass: new (...args: any[]) => T,
    ...args: any[]
  ): typeof BaseEffectService {
    return class MigratedService extends BaseEffectService {
      private readonly legacyInstance: T;

      constructor(name: string, config: EffectServiceConfig = {}) {
        super(name, config);
        this.legacyInstance = new LegacyClass(...args);
      }

      protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
        return Effect.promise(() => this.legacyInstance.start()).pipe(
          Effect.mapError(error => new StartupError({
            message: `Migrated service startup failed: ${String(error)}`,
            phase: "execution",
            cause: error
          }))
        );
      }

      protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
        return Effect.promise(() => this.legacyInstance.stop()).pipe(
          Effect.mapError(error => new ShutdownError({
            message: `Migrated service shutdown failed: ${String(error)}`,
            timeout: false,
            cause: error
          }))
        );
      }
    };
  }

  /**
   * Convert legacy ServiceConfig to EffectServiceConfig
   */
  static convertConfig(legacyConfig: ServiceConfig): EffectServiceConfig {
    const effectConfig: EffectServiceConfig = {
      restartPolicy: legacyConfig.restartPolicy,
      cronJob: legacyConfig.cronJob
    };

    // Enhanced retry policy conversion
    if (legacyConfig.restartPolicy === "on-failure") {
      effectConfig.retryPolicy = {
        type: "exponential",
        maxRetries: legacyConfig.maxRetries || 3,
        baseDelay: 1000,
        factor: 2,
        maxDuration: 120000 // 2 minutes
      };
    }

    // Add observability for migrated services
    effectConfig.observability = {
      enableTracing: true,
      enableMetrics: true,
      tags: {
        migrated: "true",
        originalType: "legacy"
      }
    };

    return effectConfig;
  }

  /**
   * Create a compatibility layer for existing API
   */
  static createCompatibilityAPI(hybridManager: HybridServiceManager) {
    return {
      // Legacy API methods that delegate to hybrid manager
      addService: (service: IService, config?: ServiceConfig) => {
        hybridManager.addService(service, config);
      },
      
      removeService: (name: string) => {
        hybridManager.removeService(name);
      },
      
      startService: (name: string) => {
        return hybridManager.startService(name);
      },
      
      stopService: (name: string) => {
        return hybridManager.stopService(name);
      },
      
      restartService: (name: string) => {
        return hybridManager.restartService(name);
      },
      
      healthCheckService: (name: string) => {
        return hybridManager.healthCheckService(name);
      },
      
      startAllServices: () => {
        return hybridManager.startAllServices();
      },
      
      stopAllServices: () => {
        return hybridManager.stopAllServices();
      },
      
      healthCheckAllServices: () => {
        return hybridManager.healthCheckAllServices();
      },
      
      get services() {
        return hybridManager.services;
      }
    };
  }
}

/**
 * Factory for creating different types of managers based on migration stage
 */
export class ManagerFactory {
  /**
   * Create a pure legacy manager (no Effect integration)
   */
  static createLegacyManager(): ServiceManager {
    return new ServiceManager();
  }

  /**
   * Create a pure Effect manager
   */
  static createEffectManager(): Effect.Effect<EffectServiceManager, never, ServiceContext> {
    return EffectServiceManager;
  }

  /**
   * Create a hybrid manager for gradual migration
   */
  static createHybridManager(): Effect.Effect<HybridServiceManager, never, ServiceContext> {
    return MigrationUtilities.createHybridManager();
  }

  /**
   * Create manager based on environment or configuration
   */
  static createManagerForEnvironment(
    useEffect: boolean = process.env.J8S_USE_EFFECT === "true"
  ): Effect.Effect<IServiceManager, never, ServiceContext> {
    if (useEffect) {
      return this.createHybridManager().pipe(
        Effect.map(manager => manager as IServiceManager)
      );
    } else {
      return Effect.succeed(this.createLegacyManager() as IServiceManager);
    }
  }
}

/**
 * Layer for creating the hybrid manager with all dependencies
 */
export const HybridManagerLayer = Layer.effect(
  "HybridManager",
  MigrationUtilities.createHybridManager()
);

/**
 * Complete compatibility layer with all required dependencies
 */
export const CompatibilityLayer = Layer.mergeAll(
  ServiceContextLive,
  EffectServiceManagerLive,
  makeObservabilityLayer({
    ...defaultObservabilityConfig,
    serviceName: "j8s-compatibility"
  }),
  HybridManagerLayer
);

/**
 * Helper function to run legacy code with Effect infrastructure
 */
export const runWithEffectSupport = <T>(
  program: Effect.Effect<T, any, ServiceContext>
): Promise<T> => {
  return Effect.runPromise(
    program.pipe(Effect.provide(CompatibilityLayer))
  );
};