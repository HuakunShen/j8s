import { Effect } from "effect";
import type {
  ServiceInstance,
  ServiceDiscovery,
  LoadBalancer,
  LoadBalanceStrategy,
  HealthCheckResult,
  AnyServiceError,
} from "./types";
import { ConsoleLoggingService, ServiceErrors } from "./index";

/**
 * In-memory service discovery implementation
 */
export class InMemoryServiceDiscovery implements ServiceDiscovery {
  private readonly instances = new Map<string, ServiceInstance>();
  private readonly logger = new ConsoleLoggingService("ServiceDiscovery");

  register(instance: ServiceInstance): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.instances.set(instance.id, instance);
      this.logger.info(
        `Registered service instance: ${instance.serviceName}@${instance.address}`
      );
    });
  }

  deregister(instanceId: string): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      const instance = this.instances.get(instanceId);
      if (instance) {
        this.instances.delete(instanceId);
        this.logger.info(
          `Deregistered service instance: ${instance.serviceName}@${instance.address}`
        );
      }
    });
  }

  discover(
    serviceName: string
  ): Effect.Effect<ServiceInstance[], AnyServiceError> {
    return Effect.sync(() => {
      const instances = Array.from(this.instances.values()).filter(
        (instance) => instance.serviceName === serviceName
      );

      this.logger.debug(
        `Discovered ${instances.length} instances for service: ${serviceName}`
      );
      return instances;
    });
  }

  getHealthyInstances(
    serviceName: string
  ): Effect.Effect<ServiceInstance[], AnyServiceError> {
    return Effect.sync(() => {
      const instances = Array.from(this.instances.values()).filter(
        (instance) =>
          instance.serviceName === serviceName &&
          instance.health.status === "healthy"
      );

      this.logger.debug(
        `Found ${instances.length} healthy instances for service: ${serviceName}`
      );
      return instances;
    });
  }
}

/**
 * Load balancer implementation with multiple strategies
 */
export class EffectLoadBalancer implements LoadBalancer {
  private readonly discovery: ServiceDiscovery;
  private readonly strategy: LoadBalanceStrategy;
  private readonly logger = new ConsoleLoggingService("LoadBalancer");

  // Round-robin state
  private readonly roundRobinIndexes = new Map<string, number>();

  constructor(
    discovery: ServiceDiscovery,
    strategy: LoadBalanceStrategy = "round-robin"
  ) {
    this.discovery = discovery;
    this.strategy = strategy;
  }

  selectInstance(
    serviceName: string
  ): Effect.Effect<ServiceInstance, AnyServiceError> {
    return this.discovery.getHealthyInstances(serviceName).pipe(
      Effect.flatMap((instances) => {
        if (instances.length === 0) {
          return Effect.fail(
            ServiceErrors.serviceError(
              `No healthy instances available for service: ${serviceName}`,
              "LoadBalancer"
            )
          );
        }

        // Select instance based on strategy
        const selectedInstance = this.selectByStrategy(serviceName, instances);

        this.logger.debug(
          `Selected instance ${selectedInstance.address} for service ${serviceName}`
        );
        return Effect.succeed(selectedInstance);
      })
    );
  }

  updateInstanceHealth(
    instanceId: string,
    health: HealthCheckResult
  ): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      // For simplicity, we'll just log the health update
      // In a real implementation, you'd store the health state
      this.logger.debug(
        `Would update health for instance ${instanceId}: ${health.status}`
      );
    });
  }

  getInstances(
    serviceName: string
  ): Effect.Effect<ServiceInstance[], AnyServiceError> {
    return this.discovery.discover(serviceName);
  }

  private selectByStrategy(
    serviceName: string,
    instances: ServiceInstance[]
  ): ServiceInstance {
    switch (this.strategy) {
      case "round-robin":
        return this.roundRobin(serviceName, instances);

      case "random":
        return this.random(instances);

      case "weighted":
        return this.weighted(instances);

      case "least-connections":
        return this.leastConnections(instances);

      case "health-based":
        return this.healthBased(instances);

      default:
        return instances[0];
    }
  }

  private roundRobin(
    serviceName: string,
    instances: ServiceInstance[]
  ): ServiceInstance {
    let index = this.roundRobinIndexes.get(serviceName) || 0;
    index = (index + 1) % instances.length;
    this.roundRobinIndexes.set(serviceName, index);
    return instances[index];
  }

  private random(instances: ServiceInstance[]): ServiceInstance {
    return instances[Math.floor(Math.random() * instances.length)];
  }

  private weighted(instances: ServiceInstance[]): ServiceInstance {
    // Calculate total weight
    const totalWeight = instances.reduce(
      (sum, instance) => sum + instance.weight,
      0
    );

    // Select random weight
    let random = Math.random() * totalWeight;

    // Find instance
    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance;
      }
    }

    return instances[instances.length - 1];
  }

  private leastConnections(instances: ServiceInstance[]): ServiceInstance {
    // For simplicity, use health check timestamp as a proxy for connection count
    // In a real implementation, you'd track actual connection counts
    return instances.reduce((least, current) =>
      current.lastHealthCheck < least.lastHealthCheck ? current : least
    );
  }

  private healthBased(instances: ServiceInstance[]): ServiceInstance {
    // Prefer instances with better health scores
    const scored = instances.map((instance) => ({
      instance,
      score: this.calculateHealthScore(instance.health),
    }));

    // Sort by score (higher is better)
    scored.sort((a, b) => b.score - a.score);

    return scored[0].instance;
  }

  private calculateHealthScore(health: HealthCheckResult): number {
    let score = 100;

    // Deduct points for non-healthy status
    if (health.status !== "healthy") {
      score -= 50;
    }

    // Deduct points for old health checks
    const age = Date.now() - health.timestamp;
    if (age > 30000) {
      // Older than 30 seconds
      score -= 25;
    }

    return Math.max(0, score);
  }
}

/**
 * Service registry that combines discovery and load balancing
 */
export class ServiceRegistry {
  private readonly discovery: ServiceDiscovery;
  private readonly loadBalancer: LoadBalancer;
  private readonly logger = new ConsoleLoggingService("ServiceRegistry");

  constructor(discovery?: ServiceDiscovery, loadBalancer?: LoadBalancer) {
    this.discovery = discovery || new InMemoryServiceDiscovery();
    this.loadBalancer = loadBalancer || new EffectLoadBalancer(this.discovery);
  }

  /**
   * Register a service instance
   */
  register(instance: ServiceInstance): Effect.Effect<void, AnyServiceError> {
    return this.discovery
      .register(instance)
      .pipe(
        Effect.flatMap(() =>
          this.loadBalancer.updateInstanceHealth(instance.id, instance.health)
        )
      );
  }

  /**
   * Deregister a service instance
   */
  deregister(instanceId: string): Effect.Effect<void, AnyServiceError> {
    return this.discovery.deregister(instanceId);
  }

  /**
   * Get a healthy service instance (load balanced)
   */
  getInstance(
    serviceName: string
  ): Effect.Effect<ServiceInstance, AnyServiceError> {
    return this.loadBalancer.selectInstance(serviceName);
  }

  /**
   * Get all healthy instances for a service
   */
  getHealthyInstances(
    serviceName: string
  ): Effect.Effect<ServiceInstance[], AnyServiceError> {
    return this.discovery.getHealthyInstances(serviceName);
  }

  /**
   * Update instance health
   */
  updateInstanceHealth(
    instanceId: string,
    health: HealthCheckResult
  ): Effect.Effect<void, AnyServiceError> {
    return this.loadBalancer.updateInstanceHealth(instanceId, health);
  }

  /**
   * Get service statistics
   */
  getStatistics(serviceName: string): Effect.Effect<
    {
      totalInstances: number;
      healthyInstances: number;
    },
    AnyServiceError
  > {
    return this.discovery.discover(serviceName).pipe(
      Effect.flatMap((instances) =>
        this.discovery.getHealthyInstances(serviceName).pipe(
          Effect.map((healthyInstances) => ({
            totalInstances: instances.length,
            healthyInstances: healthyInstances.length,
          }))
        )
      )
    );
  }
}

/**
 * Factory functions for creating service instances
 */
export class ServiceInstanceFactory {
  static create(
    serviceName: string,
    address: string,
    options: {
      id?: string;
      weight?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): ServiceInstance {
    return {
      id:
        options.id ||
        `${serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      serviceName,
      address,
      health: {
        status: "healthy",
        timestamp: Date.now(),
        details: { service: serviceName },
      },
      lastHealthCheck: Date.now(),
      weight: options.weight || 1,
      metadata: options.metadata,
    };
  }

  static fromService(
    service: any, // IEffectService
    address: string,
    options: {
      id?: string;
      weight?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): ServiceInstance {
    return this.create(service.name, address, options);
  }
}
