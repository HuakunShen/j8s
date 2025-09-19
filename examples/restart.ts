import { Effect } from "effect";
import {
  BaseService,
  ServiceManager,
  type HealthCheckResult,
} from "../index";

// Create a simple service that runs in the main thread
class SimpleService extends BaseService {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(name: string) {
    super(name);
  }

  protected onStart() {
    return Effect.tryPromise(async () => {
      console.log(`Starting ${this.name}...`);

      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw new Error("Failed to start");
    });
  }

  protected onStop() {
    return Effect.tryPromise(async () => {
      console.log(`Stopping ${this.name}...`);

      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`${this.name} stopped successfully`);
    });
  }

  protected override onHealthCheck() {
    return Effect.succeed<HealthCheckResult>({
      status: "stopped",
      details: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        uptime: process.uptime(),
      },
    });
  }
}

// Create a cron job service that runs every minute

async function runDemo() {
  // Create a service manager
  const manager = new ServiceManager();

  // Add a simple service that runs in the main thread
  const mainService = new SimpleService("main-service");
  manager.addService(mainService, {
    restartPolicy: "on-failure",
    maxRetries: 3,
  });

  // Start all services
  console.log("Starting all services...");
  try {
    await Effect.runPromise(manager.startAllServices());
  } catch (error) {
    console.log("Services failed to start, but ServiceManager is handling it");
  }

  // Monitor health
  setInterval(async () => {
    const healthStatus = await Effect.runPromise(
      manager.healthCheckAllServices()
    );
    console.log("Health Status:", JSON.stringify(healthStatus, null, 2));
  }, 5_000);

  // Set up graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await Effect.runPromise(manager.stopAllServices());
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Service manager is running. Press Ctrl+C to exit.");
}

// Silence deprecation warnings for the example
console.warn = () => {};

runDemo().catch((err) => {
  console.error("Error in demo:", err);
  process.exit(1);
});
