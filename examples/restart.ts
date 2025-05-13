import {
  BaseService,
  ServiceManager,
  createWorkerService,
  type HealthCheckResult,
} from "../index";

// Create a simple service that runs in the main thread
class SimpleService extends BaseService {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`Starting ${this.name}...`);

    // Simulate initialization
    await new Promise((resolve) => setTimeout(resolve, 1000));
    throw new Error("Failed to start");
  }

  async stop(): Promise<void> {
    console.log(`Stopping ${this.name}...`);

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Simulate cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(`${this.name} stopped successfully`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Note: No need to return status, ServiceManager will provide it
    return {
      status: "stopped", // This will be overridden by ServiceManager
      details: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        uptime: process.uptime(),
      },
    };
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
    await manager.startAllServices();
  } catch (error) {
    console.log("Services failed to start, but ServiceManager is handling it");
  }

  // Monitor health
  setInterval(async () => {
    const healthStatus = await manager.healthCheckAllServices();
    console.log("Health Status:", JSON.stringify(healthStatus, null, 2));
  }, 5_000);

  // Set up graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await manager.stopAllServices();
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
