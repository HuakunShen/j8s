/**
 * Enhanced Usage Example for j8s with Effect Integration
 *
 * This example demonstrates the enhanced features of j8s including:
 * - Enhanced adapter pattern
 * - Effect-based services
 * - Consistent error handling
 * - Performance monitoring
 * - Concurrency control
 */

import { Effect } from "effect";
import { BaseService } from "../src/BaseService";
import type { HealthCheckResult } from "../src/interface";
import { EnhancedServiceAdapter } from "../src/EnhancedServiceAdapter";
import { EnhancedServiceManager } from "../src/EnhancedServiceManager";
import { StructuredServiceError } from "../src/errors";

// Example service implementation
class DatabaseService extends BaseService {
  private isConnected = false;

  constructor() {
    super("database");
  }

  async start(): Promise<void> {
    console.log("🔌 Connecting to database...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isConnected = true;
    console.log("✅ Database service started");
  }

  async stop(): Promise<void> {
    console.log("🔌 Disconnecting from database...");
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

// Main example function using the actual EnhancedServiceManager
async function enhancedUsageExample() {
  console.log("🎯 Starting Enhanced Usage Example\n");

  // Create enhanced service manager
  const serviceManager = new EnhancedServiceManager();
  const dbService = new DatabaseService();

  try {
    // Add service using Effect-based API
    await Effect.runPromise(
      serviceManager.addService(dbService, { restartPolicy: "on-failure" })
    );

    console.log("📋 Service registered with enhanced adapter");

    // Start service with enhanced error handling and monitoring
    await Effect.runPromise(
      serviceManager.startService("database")
    );

    // Health check with enhanced details
    const health = await Effect.runPromise(
      serviceManager.healthCheckService("database")
    );

    console.log("🔍 Enhanced health check:", health);

    // Demonstrate enhanced error handling
    console.log("\n🔄 Testing error handling...");

    // Try to add a duplicate service (should fail gracefully)
    try {
      await Effect.runPromise(
        serviceManager.addService(dbService)
      );
    } catch (error) {
      if (error instanceof StructuredServiceError) {
        console.log("✅ Properly caught structured error:", error.toString());
      }
    }

    // Stop service with proper cleanup
    await Effect.runPromise(
      serviceManager.stopService("database")
    );

    console.log("✅ Enhanced usage example completed successfully");

  } catch (error) {
    console.error("❌ Example failed:", error);
    throw error;
  }
}

// Example with adapter pattern
class CacheService extends BaseService {
  private cacheSize = 0;

  constructor() {
    super("cache");
  }

  async start(): Promise<void> {
    console.log("💾 Initializing cache...");
    await new Promise(resolve => setTimeout(resolve, 500));
    this.cacheSize = 100;
    console.log("✅ Cache service started");
  }

  async stop(): Promise<void> {
    console.log("💾 Clearing cache...");
    await new Promise(resolve => setTimeout(resolve, 200));
    this.cacheSize = 0;
    console.log("🛑 Cache service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.cacheSize > 0 ? "running" : "stopped",
      details: {
        cacheSize: this.cacheSize,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function adapterPatternExample() {
  console.log("\n🎯 Starting Adapter Pattern Example\n");

  const cacheService = new CacheService();

  // Create enhanced adapter directly
  const adapter = new EnhancedServiceAdapter(cacheService);

  try {
    console.log("📋 Created enhanced adapter for cache service");

    // Use the adapter's Effect-based methods
    await Effect.runPromise(adapter.startEffect);
    console.log("🚀 Started service using adapter");

    // Health check through adapter
    const health = await Effect.runPromise(adapter.healthCheckEffect);
    console.log("🔍 Health check through adapter:", health);

    // Start as fiber for background execution
    await Effect.runPromise(adapter.startAsFiber());
    console.log("🧵 Started service as fiber");

    // Check fiber status
    const fiberOption = adapter.getFiber();
    console.log("🔍 Fiber is available:", fiberOption._tag === "Some");

    // Stop the fiber
    await Effect.runPromise(adapter.stopFiber());
    console.log("🛑 Stopped fiber");

    // Regular stop
    await Effect.runPromise(adapter.stopEffect);
    console.log("🛑 Stopped service using adapter");

    console.log("✅ Adapter pattern example completed successfully");

  } catch (error) {
    console.error("❌ Adapter example failed:", error);
    throw error;
  }
}

// Example with concurrent operations
async function concurrencyExample() {
  console.log("\n🎯 Starting Concurrency Example\n");

  const serviceManager = new EnhancedServiceManager();

  // Create multiple services
  const services = [
    new DatabaseService(),
    new CacheService(),
  ];

  try {
    // Add all services concurrently
    await Effect.runPromise(
      Effect.forEach(
        services,
        (service) => serviceManager.addService(service),
        { concurrency: 2 }
      )
    );

    console.log("📋 Added all services concurrently");

    // Start all services concurrently
    await Effect.runPromise(
      Effect.forEach(
        services.map(s => s.name),
        (serviceName) => serviceManager.startService(serviceName),
        { concurrency: 2 }
      )
    );

    console.log("🚀 Started all services concurrently");

    // Perform concurrent health checks
    const healthResults = await Effect.runPromise(
      Effect.forEach(
        services.map(s => s.name),
        (serviceName) => serviceManager.healthCheckService(serviceName),
        { concurrency: 2 }
      )
    );

    console.log("🔍 Concurrent health checks completed:", healthResults.length);

    // Stop all services concurrently
    await Effect.runPromise(
      Effect.forEach(
        services.map(s => s.name),
        (serviceName) => serviceManager.stopService(serviceName),
        { concurrency: 2 }
      )
    );

    console.log("✅ Concurrency example completed successfully");

  } catch (error) {
    console.error("❌ Concurrency example failed:", error);
    throw error;
  }
}

// Main execution
async function main() {
  await enhancedUsageExample();
  await adapterPatternExample();
  await concurrencyExample();
}

if (import.meta.main) {
  main().catch(console.error);
}

export { enhancedUsageExample, adapterPatternExample, concurrencyExample };