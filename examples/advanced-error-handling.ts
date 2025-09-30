#!/usr/bin/env node

/**
 * Advanced Error Handling Example for j8s
 *
 * This example demonstrates sophisticated error handling patterns including:
 * - Structured error types and categorization
 * - Advanced retry policies with backoff strategies
 * - Circuit breaker patterns
 * - Error monitoring and reporting
 * - Graceful degradation
 * - Error recovery strategies
 */

import {
  EnhancedServiceManager,
  BaseService,
  ServiceErrorType,
  StructuredServiceError,
} from "j8s";

import { Effect, Console } from "effect";

// Simulate external service dependencies
class DatabaseService {
  static async connect(): Promise<void> {
    if (Math.random() < 0.3) {
      throw new Error("Database connection timeout");
    }
    if (Math.random() < 0.2) {
      throw new Error("Database authentication failed");
    }
    console.log("✅ Database connected successfully");
  }

  static async query(): Promise<any[]> {
    if (Math.random() < 0.1) {
      throw new Error("Query execution failed");
    }
    return [{ id: 1, name: "test" }];
  }

  static async close(): Promise<void> {
    console.log("🔌 Database connection closed");
  }
}

class ExternalAPIService {
  static async call(endpoint: string): Promise<any> {
    if (Math.random() < 0.4) {
      throw new Error(`API call to ${endpoint} failed`);
    }
    return { status: "success", data: { timestamp: Date.now() } };
  }
}

// Service with comprehensive error handling
class RobustAPIService extends BaseService {
  private endpoint: string;
  private circuitBreakerState = { failures: 0, lastFailure: 0 };

  constructor(endpoint: string) {
    super("robust-api-service");
    this.endpoint = endpoint;
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ${this.name}`);

    // Circuit breaker logic
    if (this.circuitBreakerState.failures >= 5) {
      const timeSinceLastFailure =
        Date.now() - this.circuitBreakerState.lastFailure;
      if (timeSinceLastFailure < 30000) {
        // 30 seconds cooldown
        throw new StructuredServiceError(
          ServiceErrorType.TIMEOUT,
          this.name,
          "start",
          "Circuit breaker is open - service temporarily unavailable",
          undefined,
          new Date(),
          {
            failures: this.circuitBreakerState.failures,
            cooldownTimeLeft: 30000 - timeSinceLastFailure,
          }
        );
      } else {
        // Reset circuit breaker after cooldown
        this.circuitBreakerState.failures = 0;
        console.log("🔓 Circuit breaker reset after cooldown");
      }
    }

    // Try to connect with sophisticated error handling
    try {
      await ExternalAPIService.call(this.endpoint);
      console.log(`✅ ${this.name} connected successfully`);
    } catch (error) {
      this.circuitBreakerState.failures++;
      this.circuitBreakerState.lastFailure = Date.now();

      // Categorize different types of errors
      if (error instanceof Error && error.message.includes("timeout")) {
        throw new StructuredServiceError(
          ServiceErrorType.TIMEOUT,
          this.name,
          "start",
          "API call timeout",
          error,
          new Date(),
          { endpoint: this.endpoint, timeout: 5000 }
        );
      } else if (error instanceof Error && error.message.includes("auth")) {
        throw new StructuredServiceError(
          ServiceErrorType.VALIDATION,
          this.name,
          "start",
          "API authentication failed",
          error,
          new Date(),
          { endpoint: this.endpoint }
        );
      } else {
        throw new StructuredServiceError(
          ServiceErrorType.STARTUP,
          this.name,
          "start",
          "API connection failed",
          error instanceof Error ? error : undefined,
          new Date(),
          { endpoint: this.endpoint }
        );
      }
    }
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    try {
      await ExternalAPIService.call(`${this.endpoint}/health`);

      return {
        status: "running",
        details: {
          endpoint: this.endpoint,
          circuitBreakerState: this.circuitBreakerState,
          lastHealthCheck: Date.now(),
        },
      };
    } catch (error) {
      console.log(
        `Health check failed: ${error instanceof Error ? error.message : error}`
      );

      return {
        status: "unhealthy",
        details: {
          endpoint: this.endpoint,
          error: error instanceof Error ? error.message : String(error),
          circuitBreakerState: this.circuitBreakerState,
        },
      };
    }
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping ${this.name}`);
    // Cleanup logic here
  }
}

// Database service with resource management and error handling
class ResilientDatabaseService extends BaseService {
  private connectionPool: any[] = [];
  private maxConnections = 5;

  constructor() {
    super("resilient-database-service");
  }

  async start(): Promise<void> {
    console.log("🗄️ Starting database service");

    try {
      await DatabaseService.connect();
      this.connectionPool.push({ connected: true, timestamp: Date.now() });
      console.log("✅ Database service started successfully");
    } catch (error) {
      throw new StructuredServiceError(
        ServiceErrorType.STARTUP,
        this.name,
        "start",
        "Failed to connect to database",
        error instanceof Error ? error : undefined,
        new Date(),
        { maxRetries: 3 }
      );
    }
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    if (this.connectionPool.length === 0) {
      return {
        status: "stopped",
        details: { reason: "No active connections" },
      };
    }

    try {
      const result = await DatabaseService.query();

      return {
        status: "running",
        details: {
          connectionPoolSize: this.connectionPool.length,
          maxConnections: this.maxConnections,
          queryResult: result,
        },
      };
    } catch (error) {
      console.log(
        `Database health check failed: ${error instanceof Error ? error.message : error}`
      );

      return {
        status: "unhealthy",
        details: {
          error: error instanceof Error ? error.message : String(error),
          connectionPoolSize: this.connectionPool.length,
        },
      };
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping database service");

    // Close all connections
    for (const _connection of this.connectionPool) {
      try {
        await DatabaseService.close();
      } catch (error) {
        console.error("Failed to close database connection:", error);
      }
    }

    this.connectionPool = [];
    console.log("✅ Database service stopped");
  }
}

// Main application with comprehensive error handling
const mainProgram = Effect.gen(function* () {
  yield* Console.log("🎯 Starting Advanced Error Handling Demo");

  // Create service manager with sophisticated error handling
  const manager = new EnhancedServiceManager();

  // Create services with different error handling strategies
  const apiService = new RobustAPIService("https://api.example.com");
  const dbService = new ResilientDatabaseService();

  // Add services with different configurations
  yield* Effect.all([
    manager.addService(apiService),
    manager.addService(dbService),
  ]);

  // Start services with error handling
  const startResult = yield* Effect.either(
    Effect.all([
      manager.startService("robust-api-service"),
      manager.startService("resilient-database-service"),
    ])
  );

  if (startResult._tag === "Left") {
    yield* Console.error("❌ Failed to start services:", startResult.left);
    yield* Console.log(
      "📊 Service metrics:",
      yield* manager.getAllServicesMetrics()
    );
    return;
  }

  yield* Console.log("✅ All services started successfully");

  // Demonstrate error scenarios
  yield* Console.log("\n🔄 Simulating error scenarios...");

  // Run health checks to demonstrate error handling
  for (let i = 0; i < 5; i++) {
    yield* Console.log(`\n--- Health Check ${i + 1} ---`);

    const healthResults = yield* manager.healthCheckAllServices();

    for (let j = 0; j < healthResults.length; j++) {
      const health = healthResults[j];
      if (health) {
        yield* Console.log(`Service ${j + 1}: ${health.status}`);
        if (health.details) {
          yield* Console.log(
            `  Details: ${JSON.stringify(health.details, null, 2)}`
          );
        }
      }
    }

    yield* Effect.sleep(2000);
  }

  // Display final metrics
  yield* Console.log("\n📊 Final Service Metrics:");
  const metrics = yield* manager.getAllServicesMetrics();
  yield* Console.log(JSON.stringify(metrics, null, 2));

  // Graceful shutdown
  yield* Console.log("\n🛑 Shutting down services...");
  yield* Effect.all([
    manager.stopService("robust-api-service"),
    manager.stopService("resilient-database-service"),
  ]);
  yield* Console.log("✅ Shutdown complete");
});

// Run the program with error handling
const programWithTimeout = Effect.timeout(mainProgram, 30000);

// Execute the program
console.log("🚀 Starting Advanced Error Handling Demo...\n");
Effect.runPromise(programWithTimeout).catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
