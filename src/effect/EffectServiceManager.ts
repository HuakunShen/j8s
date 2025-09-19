import { Effect, Ref, Layer, Context, Schedule, Scope, Runtime } from "effect";
import type { ServiceStatus, HealthCheckResult } from "../interface";
import type { 
  EffectService, 
  ServiceRegistry,
  ScheduleManager,
  ResourceManager,
  ObservabilityManager,
  RetryPolicy,
  ServiceLifecycleEvent
} from "./interfaces";
import { ServiceContext, EffectServiceManager } from "./interfaces";
import { 
  AllServiceErrors, 
  ServiceError, 
  StartupError, 
  ShutdownError,
  NotFoundError 
} from "./errors";

/**
 * Service entry for internal tracking
 */
interface ServiceEntry {
  readonly service: EffectService;
  readonly status: Ref.Ref<ServiceStatus>;
  readonly restartCount: Ref.Ref<number>;
  readonly lastHealthCheck: Ref.Ref<Date | null>;
  readonly runningFiber: Ref.Ref<Effect.Fiber<void, AllServiceErrors> | null>;
}

/**
 * Implementation of ServiceRegistry
 */
class ServiceRegistryImpl implements ServiceRegistry {
  private readonly services = Ref.unsafeMake<Map<string, ServiceEntry>>(new Map());

  readonly register = (service: EffectService): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services);
      
      if (servicesMap.has(service.name)) {
        return yield* Effect.fail(new ServiceError({
          message: `Service '${service.name}' already exists`
        }));
      }

      const entry: ServiceEntry = {
        service,
        status: Ref.unsafeMake("stopped"),
        restartCount: Ref.unsafeMake(0),
        lastHealthCheck: Ref.unsafeMake(null),
        runningFiber: Ref.unsafeMake(null)
      };

      yield* Ref.update(this.services, map => new Map(map).set(service.name, entry));
    });

  readonly unregister = (name: string): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services);
      const entry = servicesMap.get(name);
      
      if (entry) {
        // Stop the service if running
        const fiber = yield* Ref.get(entry.runningFiber);
        if (fiber) {
          yield* Effect.fiberInterrupt(fiber);
        }
        
        yield* Ref.update(this.services, map => {
          const newMap = new Map(map);
          newMap.delete(name);
          return newMap;
        });
      }
    });

  readonly get = (name: string): Effect.Effect<EffectService, never, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services);
      const entry = servicesMap.get(name);
      
      if (!entry) {
        return yield* Effect.fail(new NotFoundError({
          message: `Service '${name}' not found`,
          status: 404,
          resource: name
        }));
      }
      
      return entry.service;
    });

  readonly list = (): Effect.Effect<readonly EffectService[], never, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services);
      return Array.from(servicesMap.values()).map(entry => entry.service);
    });

  // Internal method to get service entry
  readonly getEntry = (name: string): Effect.Effect<ServiceEntry, NotFoundError, never> =>
    Effect.gen(this, function* () {
      const servicesMap = yield* Ref.get(this.services);
      const entry = servicesMap.get(name);
      
      if (!entry) {
        return yield* Effect.fail(new NotFoundError({
          message: `Service '${name}' not found`,
          status: 404,
          resource: name
        }));
      }
      
      return entry;
    });
}

/**
 * Implementation of ScheduleManager  
 */
class ScheduleManagerImpl implements ScheduleManager {
  readonly createRetrySchedule = (policy: RetryPolicy): Schedule.Schedule<any, unknown, any> => {
    const baseDelay = policy.baseDelay ?? 1000;
    const factor = policy.factor ?? 2;
    const maxRetries = policy.maxRetries ?? 3;
    const maxDuration = policy.maxDuration;

    let schedule: Schedule.Schedule<any, unknown, any>;

    switch (policy.type) {
      case "linear":
        schedule = Schedule.fixed(baseDelay);
        break;
      case "exponential":
        schedule = Schedule.exponential(baseDelay, factor);
        break;
      case "fibonacci":
        schedule = Schedule.fibonacci(baseDelay);
        break;
      case "spaced":
        schedule = Schedule.spaced(baseDelay);
        break;
      case "jittered":
        schedule = Schedule.jittered(Schedule.exponential(baseDelay, factor));
        break;
      default:
        schedule = Schedule.exponential(baseDelay, factor);
    }

    // Apply max retries limit
    schedule = Schedule.compose(schedule, Schedule.recurs(maxRetries));

    // Apply max duration limit if specified
    if (maxDuration) {
      schedule = Schedule.compose(schedule, Schedule.upTo(maxDuration));
    }

    return schedule;
  };

  readonly createCronSchedule = (config): Schedule.Schedule<any, unknown, any> => {
    // This is a simplified implementation - in a real scenario you'd integrate with Effect's Cron
    // For now, we return a fixed schedule based on a rough interpretation
    return Schedule.fixed(60000); // 1 minute default - should be replaced with actual cron parsing
  };
}

/**
 * Implementation of ResourceManager
 */
class ResourceManagerImpl implements ResourceManager {
  readonly acquire = <R>(resource: Effect.Effect<R, never, never>): Effect.Effect<R, never, Scope.Scope> =>
    Effect.acquireRelease(resource, () => Effect.unit);

  readonly release = (resource: unknown): Effect.Effect<void, never, never> =>
    Effect.unit; // Resource cleanup would be handled by the acquire/release pattern
}

/**
 * Implementation of ObservabilityManager
 */
class ObservabilityManagerImpl implements ObservabilityManager {
  readonly trace = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.withSpan(effect, name);

  readonly incrementCounter = (name: string, tags?: Record<string, string>): Effect.Effect<void, never, never> =>
    Effect.log(`Counter ${name} incremented`, tags);

  readonly recordDuration = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.timed(effect).pipe(
      Effect.tap(([duration, _]) => Effect.log(`Duration ${name}: ${duration}ms`)),
      Effect.map(([_, result]) => result)
    );
}

/**
 * Main Effect Service Manager implementation
 */
class EffectServiceManagerImpl implements EffectServiceManager {
  constructor(
    private readonly serviceRegistry: ServiceRegistry,
    private readonly scheduleManager: ScheduleManager,
    private readonly observabilityManager: ObservabilityManager
  ) {}

  readonly addService = (service: EffectService): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      yield* this.serviceRegistry.register(service);
      
      // Emit lifecycle event
      yield* this.observabilityManager.trace(
        `service.added.${service.name}`,
        Effect.log(`Service '${service.name}' added to manager`)
      );
    });

  readonly removeService = (name: string): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      // Stop service first if it's running
      try {
        yield* this.stopService(name);
      } catch {
        // Ignore stop errors during removal
      }
      
      yield* this.serviceRegistry.unregister(name);
      
      yield* this.observabilityManager.trace(
        `service.removed.${name}`,
        Effect.log(`Service '${name}' removed from manager`)
      );
    });

  readonly startService = (name: string): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const serviceRegistry = this.serviceRegistry as ServiceRegistryImpl;
      const entry = yield* serviceRegistry.getEntry(name);
      const currentStatus = yield* Ref.get(entry.status);
      
      if (currentStatus === "running") {
        return; // Already running
      }

      // Set status to running
      yield* Ref.set(entry.status, "running");
      
      // Start the service with retry policy if configured
      const startEffect = entry.service.config.retryPolicy
        ? Effect.retry(entry.service.start(), this.scheduleManager.createRetrySchedule(entry.service.config.retryPolicy))
        : entry.service.start();

      // Run the service in a fiber
      const fiber = yield* Effect.fork(
        startEffect.pipe(
          Effect.tapError(error => 
            Effect.gen(function* () {
              yield* Ref.set(entry.status, "crashed");
              yield* Ref.update(entry.restartCount, n => n + 1);
            })
          ),
          Effect.tap(() => Ref.set(entry.status, "stopped"))
        )
      );

      yield* Ref.set(entry.runningFiber, fiber);
      
      yield* this.observabilityManager.incrementCounter(
        "service.start",
        { service: name }
      );
    });

  readonly stopService = (name: string): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const serviceRegistry = this.serviceRegistry as ServiceRegistryImpl;
      const entry = yield* serviceRegistry.getEntry(name);
      const currentStatus = yield* Ref.get(entry.status);
      
      if (currentStatus === "stopped") {
        return; // Already stopped
      }

      // Set status to stopping
      yield* Ref.set(entry.status, "stopping");
      
      // Interrupt running fiber if exists
      const fiber = yield* Ref.get(entry.runningFiber);
      if (fiber) {
        yield* Effect.fiberInterrupt(fiber);
        yield* Ref.set(entry.runningFiber, null);
      }

      // Call service stop method
      yield* entry.service.stop();
      yield* Ref.set(entry.status, "stopped");
      
      yield* this.observabilityManager.incrementCounter(
        "service.stop",
        { service: name }
      );
    });

  readonly restartService = (name: string): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      yield* this.stopService(name);
      yield* this.startService(name);
      
      const serviceRegistry = this.serviceRegistry as ServiceRegistryImpl;
      const entry = yield* serviceRegistry.getEntry(name);
      yield* Ref.update(entry.restartCount, n => n + 1);
    });

  readonly healthCheckService = (name: string): Effect.Effect<HealthCheckResult, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const service = yield* this.serviceRegistry.get(name);
      const health = yield* service.healthCheck();
      
      const serviceRegistry = this.serviceRegistry as ServiceRegistryImpl;
      const entry = yield* serviceRegistry.getEntry(name);
      const now = new Date();
      yield* Ref.set(entry.lastHealthCheck, now);
      
      return health;
    });

  readonly startAllServices = (): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const services = yield* this.serviceRegistry.list();
      
      yield* Effect.forEach(
        services,
        service => this.startService(service.name),
        { concurrency: "unbounded" }
      );
    });

  readonly stopAllServices = (): Effect.Effect<void, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const services = yield* this.serviceRegistry.list();
      
      yield* Effect.forEach(
        services,
        service => this.stopService(service.name),
        { concurrency: "unbounded" }
      );
    });

  readonly healthCheckAllServices = (): Effect.Effect<Record<string, HealthCheckResult>, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const services = yield* this.serviceRegistry.list();
      const results: Record<string, HealthCheckResult> = {};
      
      for (const service of services) {
        const health = yield* this.healthCheckService(service.name);
        results[service.name] = health;
      }
      
      return results;
    });

  readonly getServiceStatus = (name: string): Effect.Effect<ServiceStatus, AllServiceErrors, ServiceContext> =>
    Effect.gen(this, function* () {
      const serviceRegistry = this.serviceRegistry as ServiceRegistryImpl;
      const entry = yield* serviceRegistry.getEntry(name);
      return yield* Ref.get(entry.status);
    });
}

/**
 * Service context layer that provides all required dependencies
 */
export const ServiceContextLive = Layer.effect(
  ServiceContext,
  Effect.gen(function* () {
    const serviceRegistry = new ServiceRegistryImpl();
    const scheduleManager = new ScheduleManagerImpl();
    const resourceManager = new ResourceManagerImpl();
    const observabilityManager = new ObservabilityManagerImpl();

    return {
      serviceRegistry,
      scheduleManager,
      resourceManager,
      observabilityManager
    };
  })
);

/**
 * Effect Service Manager layer
 */
export const EffectServiceManagerLive = Layer.effect(
  EffectServiceManager,
  Effect.gen(function* () {
    const context = yield* ServiceContext;
    return new EffectServiceManagerImpl(
      context.serviceRegistry,
      context.scheduleManager,
      context.observabilityManager
    );
  })
).pipe(Layer.provide(ServiceContextLive));

/**
 * Main runtime for Effect services
 * TODO: Fix Runtime API usage
 */
// export const EffectServiceRuntime = Runtime.defaultRuntime.pipe(
//   Runtime.provide(EffectServiceManagerLive)
// );