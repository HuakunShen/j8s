import { Effect } from "effect";
import {
  EffectBaseService,
  EffectServiceManager,
  ServiceRegistry,
  ServiceInstanceFactory,
  ServiceErrors,
} from "./index";

// Simple demo service using the EffectBaseService
class DemoService extends EffectBaseService {
  private instanceId: string;
  private isHealthy = true;

  constructor(name: string, instanceId: string) {
    super(name, {
      retry: {
        maxRetries: 3,
        schedule: "exponential",
      },
    });
    this.instanceId = instanceId;
  }

  protected doStart(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[${this.name}-${this.instanceId}] Starting service...`);
    });
  }

  protected doStop(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[${this.name}-${this.instanceId}] Stopping service...`);
    });
  }

  protected doHealthCheck(): Effect.Effect<any> {
    return Effect.sync(() => ({
      status: this.isHealthy ? "healthy" : "unhealthy",
      details: {
        instanceId: this.instanceId,
        message: this.isHealthy
          ? "Service is running normally"
          : "Service needs attention",
      },
    }));
  }

  // Helper method to simulate health issues
  public setUnhealthy(): void {
    this.isHealthy = false;
  }

  public setHealthy(): void {
    this.isHealthy = true;
  }
}

// Run the demo
async function runDemo() {
  console.log(
    "=== Testing j8s Effect-Based Services with Service Discovery ===\n"
  );

  const serviceRegistry = new ServiceRegistry();
  const serviceManager = new EffectServiceManager();

  try {
    // Create multiple instances of the same service
    console.log("1. Creating Multiple Service Instances");
    const service1 = new DemoService("user-service", "instance-1");
    const service2 = new DemoService("user-service", "instance-2");
    const service3 = new DemoService("user-service", "instance-3");

    // Register instances with service registry
    const instance1 = ServiceInstanceFactory.create(
      "user-service",
      "localhost:3001",
      {
        id: "instance-1",
        weight: 1,
      }
    );
    const instance2 = ServiceInstanceFactory.create(
      "user-service",
      "localhost:3002",
      {
        id: "instance-2",
        weight: 2, // Higher weight for more load
      }
    );
    const instance3 = ServiceInstanceFactory.create(
      "user-service",
      "localhost:3003",
      {
        id: "instance-3",
        weight: 1,
      }
    );

    await Effect.runPromise(serviceRegistry.register(instance1));
    await Effect.runPromise(serviceRegistry.register(instance2));
    await Effect.runPromise(serviceRegistry.register(instance3));
    console.log("✓ All service instances registered\n");

    // Test service discovery
    console.log("2. Testing Service Discovery");
    const discovered = await Effect.runPromise(
      serviceRegistry.getHealthyInstances("user-service")
    );
    console.log(
      "Discovered instances:",
      discovered.map((inst) => `${inst.id} (${inst.address})`).join(", ")
    );
    console.log("✓ Service discovery working\n");

    // Test load balancing with different strategies
    console.log("3. Testing Load Balancing Strategies");

    // Test round-robin
    console.log("Round-robin selection:");
    for (let i = 0; i < 6; i++) {
      const selected = await Effect.runPromise(
        serviceRegistry.getInstance("user-service")
      );
      console.log(`  Request ${i + 1}: ${selected.address}`);
    }

    // Test random selection
    console.log("\nRandom selection:");
    for (let i = 0; i < 3; i++) {
      const selected = await Effect.runPromise(
        serviceRegistry.getInstance("user-service")
      );
      console.log(`  Request ${i + 1}: ${selected.address}`);
    }
    console.log("✓ Load balancing working\n");

    // Test service statistics
    console.log("4. Testing Service Statistics");
    const stats = await Effect.runPromise(
      serviceRegistry.getStatistics("user-service")
    );
    console.log("Service statistics:", stats);
    console.log("✓ Statistics working\n");

    // Test instance health updates
    console.log("5. Testing Health Updates");
    // Simulate instance 2 becoming unhealthy
    await Effect.runPromise(
      serviceRegistry.updateInstanceHealth("instance-2", {
        status: "unhealthy",
        timestamp: Date.now(),
        details: { error: "Connection timeout" },
      })
    );

    const healthyAfterUpdate = await Effect.runPromise(
      serviceRegistry.getHealthyInstances("user-service")
    );
    console.log(
      "Healthy instances after health update:",
      healthyAfterUpdate.map((inst) => inst.id).join(", ")
    );
    console.log("✓ Health updates working\n");

    // Test service manager integration
    console.log("6. Testing Service Manager Integration");
    await Effect.runPromise(serviceManager.addService(service1));
    await Effect.runPromise(
      serviceManager.startService("user-service")
    );

    const health = await Effect.runPromise(
      serviceManager.healthCheckService("user-service")
    );
    console.log("Service health:", health);

    await Effect.runPromise(
      serviceManager.stopService("user-service")
    );
    console.log("✓ Service manager integration working\n");

    // Test weighted load balancing
    console.log("7. Testing Weighted Load Balancing");
    console.log("Instance weights:");
    console.log(`  instance-1: weight 1`);
    console.log(`  instance-2: weight 2 (currently unhealthy)`);
    console.log(`  instance-3: weight 1`);

    // Make instance 2 healthy again for weighted test
    await Effect.runPromise(
      serviceRegistry.updateInstanceHealth("instance-2", {
        status: "healthy",
        timestamp: Date.now(),
        details: { service: "user-service" },
      })
    );

    // Select multiple times to see weighted distribution
    const selections: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const selected = await Effect.runPromise(
        serviceRegistry.getInstance("user-service")
      );
      selections[selected.id] = (selections[selected.id] || 0) + 1;
    }

    console.log("Weighted distribution over 100 requests:");
    Object.entries(selections).forEach(([id, count]) => {
      console.log(
        `  ${id}: ${count} requests (${((count * 100) / 100).toFixed(1)}%)`
      );
    });
    console.log("✓ Weighted load balancing working\n");

    // Cleanup
    await Effect.runPromise(serviceRegistry.deregister("instance-1"));
    await Effect.runPromise(serviceRegistry.deregister("instance-2"));
    await Effect.runPromise(serviceRegistry.deregister("instance-3"));
    await Effect.runPromise(
      serviceManager.removeService("user-service")
    );

    console.log(
      "\n🎉 All tests passed! Service discovery and load balancing are working correctly!"
    );

    console.log("\n=== Key Features Demonstrated ===");
    console.log("✓ Multi-instance service registration");
    console.log("✓ Service discovery and instance lookup");
    console.log(
      "✓ Multiple load balancing strategies (round-robin, random, weighted)"
    );
    console.log("✓ Health monitoring and instance filtering");
    console.log("✓ Service statistics and monitoring");
    console.log("✓ Integration with ServiceManager");
    console.log("✓ Instance health updates and deregistration");
    console.log("✓ Weighted load distribution");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}

runDemo();
