/**
 * Basic Effect Service Example
 *
 * This example demonstrates how to create and manage services using j8s with Effect.
 * It shows the Effect-based APIs for service management operations.
 */

import { Effect } from "effect";
import { BaseService, ServiceManager } from "../index";
import type { HealthCheckResult } from "../index";

// Example service that demonstrates Effect integration
class DatabaseService extends BaseService {
  private isConnected = false;

  async start(): Promise<void> {
    console.log("🔌 Connecting to database...");
    // Simulate connection setup
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isConnected = true;
    console.log("✅ Database service started");
  }

  async stop(): Promise<void> {
    console.log("🔌 Disconnecting from database...");
    // Simulate cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    this.isConnected = false;
    console.log("🛑 Database service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isConnected ? "running" : "stopped",
      details: {
        connected: this.isConnected,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

class ApiService extends BaseService {
  private server: any = null;

  async start(): Promise<void> {
    console.log("🚀 Starting API server...");
    // Simulate server startup
    await new Promise(resolve => setTimeout(resolve, 800));
    this.server = { port: 3000, status: "running" };
    console.log("✅ API service started on port 3000");
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping API server...");
    // Simulate server shutdown
    await new Promise(resolve => setTimeout(resolve, 300));
    this.server = null;
    console.log("🛑 API service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.server ? "running" : "stopped",
      details: {
        server: this.server,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Main example function demonstrating Effect-based service management
async function basicEffectExample() {
  console.log("🎯 Starting Basic Effect Service Example\n");

  // Create service manager and services
  const serviceManager = new ServiceManager();
  const dbService = new DatabaseService("database");
  const apiService = new ApiService("api");

  // Add services to manager
  serviceManager.addService(dbService, { restartPolicy: "on-failure" });
  serviceManager.addService(apiService, { restartPolicy: "always" });

  console.log("📋 Services registered:");
  serviceManager.services.forEach(service => {
    console.log(`  - ${service.name}`);
  });
  console.log();

  // Using Effect-based APIs for service management
  const program = Effect.gen(function* () {
    console.log("🔧 Using Effect-based service management:");

    // Start all services using Effect API
    console.log("⚡ Starting all services...");
    yield* serviceManager.startAllServicesEffect();
    console.log("✅ All services started successfully\n");

    // Health check all services using Effect API
    console.log("🔍 Checking health of all services...");
    const healthResults = yield* serviceManager.healthCheckAllServicesEffect();

    console.log("📊 Health check results:");
    Object.entries(healthResults).forEach(([name, health]) => {
      console.log(`  - ${name}: ${health.status}`);
      if (health.details) {
        console.log(`    Details: ${JSON.stringify(health.details, null, 4)}`);
      }
    });
    console.log();

    // Individual service operations using Effect API
    console.log("🎯 Demonstrating individual service operations:");

    // Stop the database service
    console.log("🛑 Stopping database service...");
    yield* serviceManager.stopServiceEffect("database");

    // Check health of just the database service
    const dbHealth = yield* serviceManager.healthCheckServiceEffect("database");
    console.log(`📊 Database health: ${dbHealth.status}`);

    // Restart the database service
    console.log("🔄 Restarting database service...");
    yield* serviceManager.startServiceEffect("database");

    const dbHealthAfterRestart = yield* serviceManager.healthCheckServiceEffect("database");
    console.log(`📊 Database health after restart: ${dbHealthAfterRestart.status}\n`);

    // Stop all services
    console.log("🛑 Stopping all services...");
    yield* serviceManager.stopAllServicesEffect();
    console.log("✅ All services stopped successfully");

    return "🎉 Basic Effect example completed successfully!";
  });

  // Run the Effect program
  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Error running Effect program:", error);
  }
}

// Error handling example showing Effect's built-in error management
async function errorHandlingExample() {
  console.log("\n\n🎯 Starting Error Handling Example\n");

  const serviceManager = new ServiceManager();

  // Create a service that will fail
  class FailingService extends BaseService {
    async start(): Promise<void> {
      throw new Error("Service failed to start - simulated error");
    }

    async stop(): Promise<void> {
      console.log("Stopping failing service");
    }

    async healthCheck(): Promise<HealthCheckResult> {
      return { status: "stopped" };
    }
  }

  const failingService = new FailingService("failing-service");
  serviceManager.addService(failingService);

  // Effect program with error handling
  const program = Effect.gen(function* () {
    console.log("🔧 Demonstrating Effect error handling:");

    // Try to start a service that will fail
    console.log("⚡ Attempting to start failing service...");

    // This will capture the error in the Effect context
    const result = yield* Effect.either(
      serviceManager.startServiceEffect("failing-service")
    );

    if (result._tag === "Left") {
      console.log("❌ Service failed to start (as expected):");
      console.log(`   Error: ${result.left.message}`);
    } else {
      console.log("✅ Service started successfully");
    }

    // Try to start a non-existent service
    console.log("\n🔍 Attempting to start non-existent service...");
    const nonExistentResult = yield* Effect.either(
      serviceManager.startServiceEffect("non-existent")
    );

    if (nonExistentResult._tag === "Left") {
      console.log("❌ Non-existent service error (as expected):");
      console.log(`   Error: ${nonExistentResult.left.message}`);
    }

    return "🎉 Error handling example completed!";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Unexpected error:", error);
  }
}

// Main execution
if (import.meta.main) {
  await basicEffectExample();
  await errorHandlingExample();
}

export { basicEffectExample, errorHandlingExample };