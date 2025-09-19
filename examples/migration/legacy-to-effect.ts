/**
 * Migration Example: Legacy to Effect
 * 
 * This example demonstrates how to migrate from the legacy j8s system
 * to the new Effect-based system using the compatibility layer.
 */

import { Effect, Console } from "effect";
import { BaseService } from "../../src/BaseService";
import { ServiceManager } from "../../src/ServiceManager";
import type { HealthCheckResult } from "../../src/interface";
import { 
  MigrationUtilities, 
  HybridServiceManager,
  CompatibilityLayer,
  runWithEffectSupport 
} from "../../src/effect/CompatibilityLayer";
import { BaseEffectService } from "../../src/effect/BaseEffectService";
import type { ServiceContext, EffectServiceConfig } from "../../src/effect/interfaces";
import { StartupError, ShutdownError } from "../../src/effect/errors";

/**
 * Example legacy service
 */
class LegacyEmailService extends BaseService {
  private interval: NodeJS.Timeout | null = null;
  private emailCount = 0;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`Starting legacy email service: ${this.name}`);
    
    this.interval = setInterval(() => {
      this.emailCount++;
      console.log(`[${this.name}] Sent email #${this.emailCount}`);
    }, 3000);
    
    console.log(`Legacy email service ${this.name} started`);
  }

  async stop(): Promise<void> {
    console.log(`Stopping legacy email service: ${this.name}`);
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    console.log(`Legacy email service ${this.name} stopped. Total emails: ${this.emailCount}`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.interval ? "running" : "stopped",
      details: {
        emailsSent: this.emailCount,
        hasInterval: this.interval !== null
      }
    };
  }
}

/**
 * Migrated Effect-based version of the email service
 */
class EffectEmailService extends BaseEffectService {
  private emailCount = 0;
  private interval: NodeJS.Timeout | null = null;

  constructor(name: string, config: EffectServiceConfig = {}) {
    super(name, {
      ...config,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { serviceType: "email", version: "2.0" }
      }
    });
  }

  protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Console.log(`Starting Effect email service: ${this.name}`);
      
      this.interval = setInterval(() => {
        this.emailCount++;
        console.log(`[${this.name}] Sent email #${this.emailCount} (Effect version)`);
        
        // Record metrics using Effect observability
        Effect.runSync(
          context.observabilityManager.incrementCounter(
            "emails.sent",
            { service: this.name }
          )
        );
      }, 2000); // Slightly faster than legacy
      
      yield* Console.log(`Effect email service ${this.name} started`);
      
      // Keep running until stopped
      yield* Effect.never;
    });
  }

  protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
    return Effect.gen(this, function* () {
      yield* Console.log(`Stopping Effect email service: ${this.name}`);
      
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      
      yield* Console.log(`Effect email service ${this.name} stopped. Total emails: ${this.emailCount}`);
    });
  }

  getEmailCount(): number {
    return this.emailCount;
  }
}

/**
 * Demonstrate legacy-only approach
 */
const demonstrateLegacyApproach = async () => {
  console.log("\n=== Legacy Approach (Original j8s) ===");
  
  const manager = new ServiceManager();
  const emailService = new LegacyEmailService("legacy-email");
  
  // Use traditional API
  manager.addService(emailService, {
    restartPolicy: "on-failure",
    maxRetries: 3
  });
  
  console.log("Added legacy service to manager");
  
  // Start service
  await manager.startService("legacy-email");
  console.log("Started legacy service");
  
  // Let it run for a bit
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  // Check health
  const health = await manager.healthCheckService("legacy-email");
  console.log("Legacy service health:", health);
  
  // Stop service
  await manager.stopService("legacy-email");
  console.log("Stopped legacy service");
};

/**
 * Demonstrate hybrid approach (migration step)
 */
const demonstrateHybridApproach = () => runWithEffectSupport(
  Effect.gen(function* () {
    yield* Console.log("\n=== Hybrid Approach (Migration Step) ===");
    
    // Create hybrid manager
    const hybridManager = yield* MigrationUtilities.createHybridManager();
    
    // Add legacy service (wrapped for Effect compatibility)
    const legacyService = new LegacyEmailService("hybrid-legacy-email");
    const wrappedLegacyService = MigrationUtilities.wrapLegacyService(legacyService, {
      observability: {
        enableMetrics: true,
        tags: { migrationStage: "wrapped-legacy" }
      }
    });
    
    // Add Effect service
    const effectService = new EffectEmailService("hybrid-effect-email");
    
    // Add both services to hybrid manager
    yield* Effect.promise(() => hybridManager.addService(legacyService));
    // hybridManager.addService(effectService); // This would use Effect manager internally
    
    yield* Console.log("Added both legacy and Effect services to hybrid manager");
    
    // Start all services
    yield* Effect.promise(() => hybridManager.startAllServices());
    yield* Console.log("Started all services in hybrid manager");
    
    // Let them run
    yield* Effect.sleep(10000);
    
    // Check health of all services
    const allHealth = yield* Effect.promise(() => hybridManager.healthCheckAllServices());
    yield* Console.log("Hybrid manager health check:");
    for (const [name, health] of Object.entries(allHealth)) {
      yield* Console.log(`  ${name}: ${health.status} (${JSON.stringify(health.details)})`);
    }
    
    // Stop all services
    yield* Effect.promise(() => hybridManager.stopAllServices());
    yield* Console.log("Stopped all services in hybrid manager");
  })
);

/**
 * Demonstrate pure Effect approach
 */
const demonstrateEffectApproach = () => runWithEffectSupport(
  Effect.gen(function* () {
    yield* Console.log("\n=== Pure Effect Approach (Future State) ===");
    
    const effectManager = yield* EffectServiceManager;
    
    // Create Effect services
    const emailService = new EffectEmailService("effect-email", {
      retryPolicy: {
        type: "exponential",
        maxRetries: 3,
        baseDelay: 1000,
        factor: 2
      },
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { environment: "production", version: "2.0" }
      }
    });
    
    const notificationService = new EffectEmailService("effect-notifications", {
      retryPolicy: {
        type: "linear",
        maxRetries: 5,
        baseDelay: 500
      }
    });
    
    // Add services to Effect manager
    yield* effectManager.addService(emailService);
    yield* effectManager.addService(notificationService);
    
    yield* Console.log("Added Effect services to manager");
    
    // Start all services
    yield* effectManager.startAllServices();
    yield* Console.log("Started all Effect services");
    
    // Let them run
    yield* Effect.sleep(8000);
    
    // Perform comprehensive health checks
    const healthResults = yield* effectManager.healthCheckAllServices();
    yield* Console.log("Effect manager comprehensive health check:");
    for (const [name, health] of Object.entries(healthResults)) {
      yield* Console.log(`  ${name}: ${health.status}`);
      yield* Console.log(`    Uptime: ${health.uptime}ms`);
      yield* Console.log(`    Restarts: ${health.restartCount}`);
      if (health.metrics) {
        yield* Console.log(`    Success count: ${health.metrics.successCount}`);
        yield* Console.log(`    Error count: ${health.metrics.errorCount}`);
      }
    }
    
    // Test individual service methods
    const emailCount = emailService.getEmailCount();
    yield* Console.log(`Email service sent ${emailCount} emails`);
    
    // Stop all services
    yield* effectManager.stopAllServices();
    yield* Console.log("Stopped all Effect services");
  })
);

/**
 * Demonstrate gradual migration strategy
 */
const demonstrateGradualMigration = () => runWithEffectSupport(
  Effect.gen(function* () {
    yield* Console.log("\n=== Gradual Migration Strategy ===");
    
    const hybridManager = yield* MigrationUtilities.createHybridManager();
    
    // Step 1: Start with legacy services
    yield* Console.log("Step 1: Add legacy services");
    const legacyEmailService = new LegacyEmailService("email-service");
    hybridManager.addService(legacyEmailService, {
      restartPolicy: "on-failure",
      maxRetries: 3
    });
    
    yield* Effect.promise(() => hybridManager.startService("email-service"));
    yield* Effect.sleep(3000);
    
    // Step 2: Add Effect version alongside (blue-green deployment)
    yield* Console.log("Step 2: Add Effect version alongside");
    const effectEmailService = new EffectEmailService("email-service-v2");
    // In practice, you'd add this to the Effect manager part of the hybrid
    
    yield* Effect.sleep(3000);
    
    // Step 3: Gradually shift traffic to Effect version
    yield* Console.log("Step 3: Traffic shifting (simulated)");
    yield* Effect.sleep(2000);
    
    // Step 4: Remove legacy version
    yield* Console.log("Step 4: Remove legacy version");
    yield* Effect.promise(() => hybridManager.stopService("email-service"));
    hybridManager.removeService("email-service");
    
    yield* Console.log("Migration completed successfully!");
    
    // Final health check
    const finalHealth = yield* Effect.promise(() => hybridManager.healthCheckAllServices());
    yield* Console.log("Final system state:");
    for (const [name, health] of Object.entries(finalHealth)) {
      yield* Console.log(`  ${name}: ${health.status}`);
    }
    
    yield* Effect.promise(() => hybridManager.stopAllServices());
  })
);

/**
 * Main program that demonstrates all migration approaches
 */
const program = Effect.gen(function* () {
  yield* Console.log("=== j8s Migration Example ===");
  yield* Console.log("This example shows how to migrate from legacy j8s to Effect-based j8s");
  
  // Run all demonstrations in sequence
  yield* Effect.promise(() => demonstrateLegacyApproach());
  yield* demonstrateHybridApproach();
  yield* demonstrateEffectApproach();
  yield* demonstrateGradualMigration();
  
  yield* Console.log("\n=== Migration Example Complete ===");
  yield* Console.log("Key takeaways:");
  yield* Console.log("1. Legacy services can be wrapped to work with Effect system");
  yield* Console.log("2. Hybrid manager allows running both legacy and Effect services");
  yield* Console.log("3. Effect services provide better observability and error handling");
  yield* Console.log("4. Migration can be done gradually without downtime");
});

/**
 * Run the migration example
 */
const runExample = () => {
  console.log("Starting j8s Migration Example...");
  
  Effect.runPromise(
    program.pipe(
      Effect.provide(CompatibilityLayer),
      Effect.catchAll(error => 
        Console.log(`Migration example error: ${error}`).pipe(
          Effect.map(() => process.exit(1))
        )
      )
    )
  ).then(() => {
    console.log("Migration example completed successfully");
    process.exit(0);
  }).catch(error => {
    console.error("Migration example failed:", error);
    process.exit(1);
  });
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Run if this file is executed directly
if (require.main === module) {
  runExample();
}

export { 
  LegacyEmailService, 
  EffectEmailService, 
  runExample,
  demonstrateLegacyApproach,
  demonstrateHybridApproach,
  demonstrateEffectApproach,
  demonstrateGradualMigration
};