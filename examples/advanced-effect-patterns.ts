/**
 * Advanced Effect Patterns with j8s
 *
 * This example demonstrates advanced Effect patterns including:
 * - Retry logic with schedules
 * - Timeout handling
 * - Concurrent service operations
 * - Resource management
 * - Service dependencies
 */

import { Effect, Schedule, Duration } from "effect";
import { BaseService, ServiceManager } from "../index";
import type { HealthCheckResult } from "../index";

// Service that demonstrates retry patterns
class UnreliableService extends BaseService {
  private attempts = 0;
  private maxAttempts = 3;
  private isRunning = false;

  async start(): Promise<void> {
    this.attempts++;
    console.log(`🔄 UnreliableService start attempt ${this.attempts}`);

    if (this.attempts < this.maxAttempts) {
      throw new Error(`Start attempt ${this.attempts} failed`);
    }

    console.log("✅ UnreliableService started successfully");
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.attempts = 0; // Reset for next time
    console.log("🛑 UnreliableService stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: { attempts: this.attempts },
    };
  }
}

// Service that can timeout
class SlowService extends BaseService {
  private isRunning = false;

  async start(): Promise<void> {
    console.log("🐌 SlowService starting (takes 5 seconds)...");
    // Simulate slow startup
    await new Promise(resolve => setTimeout(resolve, 5000));
    this.isRunning = true;
    console.log("✅ SlowService started");
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log("🛑 SlowService stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
    };
  }
}

// Service that depends on others
class DependentService extends BaseService {
  private isRunning = false;

  constructor(name: string, private dependencies: string[]) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`🔗 ${this.name} checking dependencies: ${this.dependencies.join(", ")}`);
    // In real world, you'd check if dependencies are healthy
    this.isRunning = true;
    console.log(`✅ ${this.name} started`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log(`🛑 ${this.name} stopped`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: { dependencies: this.dependencies },
    };
  }
}

// Example 1: Retry with exponential backoff
async function retryPatternExample() {
  console.log("🎯 Retry Pattern Example\n");

  const serviceManager = new ServiceManager();
  const unreliableService = new UnreliableService("unreliable");
  serviceManager.addService(unreliableService);

  const retrySchedule = Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(5)), // Max 5 retries
    Schedule.jittered // Add some randomness to avoid thundering herd
  );

  const program = Effect.gen(function* () {
    console.log("🔄 Starting service with retry logic...");

    // Use Effect's retry capability with the service
    const result = yield* Effect.retry(
      serviceManager.startServiceEffect("unreliable"),
      retrySchedule
    );

    console.log("✅ Service started successfully after retries");

    // Check health
    const health = yield* serviceManager.healthCheckServiceEffect("unreliable");
    console.log(`📊 Health: ${health.status}`);
    console.log(`📊 Attempts made: ${health.details?.attempts}`);

    return "Retry example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Retry example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 2: Timeout handling
async function timeoutExample() {
  console.log("\n\n🎯 Timeout Example\n");

  const serviceManager = new ServiceManager();
  const slowService = new SlowService("slow");
  serviceManager.addService(slowService);

  const program = Effect.gen(function* () {
    console.log("⏱️  Starting slow service with 2-second timeout...");

    // Add timeout to service start
    const result = yield* Effect.either(
      Effect.timeout(
        serviceManager.startServiceEffect("slow"),
        Duration.seconds(2)
      )
    );

    if (result._tag === "Left") {
      console.log("⏰ Service start timed out (as expected)");
    } else {
      console.log("✅ Service started within timeout");
    }

    // Try again with longer timeout
    console.log("\n⏱️  Starting slow service with 10-second timeout...");
    yield* Effect.timeout(
      serviceManager.startServiceEffect("slow"),
      Duration.seconds(10)
    );
    console.log("✅ Service started with longer timeout");

    return "Timeout example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Timeout example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 3: Concurrent operations
async function concurrentExample() {
  console.log("\n\n🎯 Concurrent Operations Example\n");

  const serviceManager = new ServiceManager();

  // Add multiple services
  for (let i = 1; i <= 3; i++) {
    const service = new DependentService(`service-${i}`, []);
    serviceManager.addService(service);
  }

  const program = Effect.gen(function* () {
    console.log("🚀 Starting services concurrently...");

    // Start services concurrently instead of sequentially
    const startEffects = [
      serviceManager.startServiceEffect("service-1"),
      serviceManager.startServiceEffect("service-2"),
      serviceManager.startServiceEffect("service-3"),
    ];

    // Effect.all runs effects concurrently by default
    yield* Effect.all(startEffects, { concurrency: "unbounded" });
    console.log("✅ All services started concurrently");

    // Concurrent health checks
    console.log("\n🔍 Running concurrent health checks...");
    const healthEffects = [
      serviceManager.healthCheckServiceEffect("service-1"),
      serviceManager.healthCheckServiceEffect("service-2"),
      serviceManager.healthCheckServiceEffect("service-3"),
    ];

    const healthResults = yield* Effect.all(healthEffects, { concurrency: "unbounded" });
    healthResults.forEach((health, index) => {
      console.log(`📊 Service ${index + 1}: ${health.status}`);
    });

    return "Concurrent example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Concurrent example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 4: Service dependency management
async function dependencyExample() {
  console.log("\n\n🎯 Service Dependency Example\n");

  const serviceManager = new ServiceManager();

  // Create services with dependencies
  const database = new DependentService("database", []);
  const cache = new DependentService("cache", ["database"]);
  const api = new DependentService("api", ["database", "cache"]);

  serviceManager.addService(database);
  serviceManager.addService(cache);
  serviceManager.addService(api);

  const program = Effect.gen(function* () {
    console.log("🔗 Starting services in dependency order...");

    // Start services in correct dependency order
    console.log("1️⃣ Starting database (no dependencies)...");
    yield* serviceManager.startServiceEffect("database");

    console.log("2️⃣ Starting cache (depends on database)...");
    yield* serviceManager.startServiceEffect("cache");

    console.log("3️⃣ Starting API (depends on database and cache)...");
    yield* serviceManager.startServiceEffect("api");

    console.log("\n📊 All services started in dependency order!");

    // Health check all services
    const healthResults = yield* serviceManager.healthCheckAllServicesEffect();
    Object.entries(healthResults).forEach(([name, health]) => {
      console.log(`📊 ${name}: ${health.status}`);
      if (health.details?.dependencies) {
        console.log(`   Dependencies: ${health.details.dependencies.join(", ")}`);
      }
    });

    // Stop services in reverse dependency order
    console.log("\n🛑 Stopping services in reverse dependency order...");
    console.log("1️⃣ Stopping API...");
    yield* serviceManager.stopServiceEffect("api");

    console.log("2️⃣ Stopping cache...");
    yield* serviceManager.stopServiceEffect("cache");

    console.log("3️⃣ Stopping database...");
    yield* serviceManager.stopServiceEffect("database");

    return "Dependency example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Dependency example failed:", error);
  }
}

// Example 5: Resource management with Effect
async function resourceManagementExample() {
  console.log("\n\n🎯 Resource Management Example\n");

  const serviceManager = new ServiceManager();

  // Simulate a resource that needs proper cleanup
  const createManagedResource = Effect.gen(function* () {
    console.log("🔧 Acquiring expensive resource...");
    const resource = { id: Math.random(), active: true };

    return yield* Effect.acquireRelease(
      Effect.succeed(resource),
      (resource) => Effect.sync(() => {
        console.log(`🧹 Cleaning up resource ${resource.id}`);
        resource.active = false;
      })
    );
  });

  const program = Effect.gen(function* () {
    console.log("🎯 Using Effect's resource management with services...");

    // Use resource management pattern
    yield* Effect.scoped(
      Effect.gen(function* () {
        const resource = yield* createManagedResource;
        console.log(`✅ Resource acquired: ${resource.id}`);

        // Use the resource with service operations
        const api = new DependentService("resource-api", []);
        serviceManager.addService(api);

        yield* serviceManager.startServiceEffect("resource-api");
        console.log("✅ Service started with managed resource");

        const health = yield* serviceManager.healthCheckServiceEffect("resource-api");
        console.log(`📊 Service health: ${health.status}`);

        yield* serviceManager.stopServiceEffect("resource-api");
        console.log("🛑 Service stopped");

        // Resource will be automatically cleaned up when scope exits
        return "Resource management completed";
      })
    );

    return "Resource management example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Resource management example failed:", error);
  }
}

// Main execution
if (import.meta.main) {
  await retryPatternExample();
  await timeoutExample();
  await concurrentExample();
  await dependencyExample();
  await resourceManagementExample();
}

export {
  retryPatternExample,
  timeoutExample,
  concurrentExample,
  dependencyExample,
  resourceManagementExample,
};