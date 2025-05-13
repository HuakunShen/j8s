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
    this.setStatus("starting");

    // Simulate initialization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.intervalId = setInterval(() => {
      console.log(`${this.name} is running...`);
    }, 5000);

    this.setStatus("running");
    console.log(`${this.name} started successfully`);
  }

  async stop(): Promise<void> {
    console.log(`Stopping ${this.name}...`);
    this.setStatus("stopping");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Simulate cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.setStatus("stopped");
    console.log(`${this.name} stopped successfully`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const baseCheck = await super.healthCheck();
    return {
      ...baseCheck,
      details: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        uptime: process.uptime(),
      },
    };
  }
}

// Create a cron job service that runs every minute
class CronService extends BaseService {
  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`Running cron job ${this.name}...`);
    this.setStatus("running");

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`Cron job ${this.name} completed`);
    this.setStatus("stopped");
  }

  async stop(): Promise<void> {
    console.log(`Stopping cron job ${this.name}...`);
    this.setStatus("stopped");
  }
}

async function runDemo() {
  // Create a service manager
  const manager = new ServiceManager();

  // Add a simple service that runs in the main thread
  const mainService = new SimpleService("main-service");
  manager.addService(mainService, {
    restartPolicy: "always",
  });

  // Add a worker service from an existing worker file
  const workerService = createWorkerService(
    "logging-service",
    new URL("./logService.ts", import.meta.url),
    { autoTerminate: false },
  );
  manager.addService(workerService, {
    restartPolicy: "on-failure",
    maxRetries: 3,
  });

  // Add a cron job service
  const cronService = new CronService("backup-service");
  manager.addService(cronService, {
    cronJob: {
      schedule: "* * * * *", // Run every minute
      timeout: 5000, // Timeout after 5 seconds
    },
  });

  // Start all services
  console.log("Starting all services...");
  await manager.startAllServices();

  // Monitor health
  setInterval(async () => {
    const healthStatus = await manager.healthCheckAllServices();
    console.log("Health Status:", JSON.stringify(healthStatus, null, 2));
  }, 10000);

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

runDemo().catch((err) => {
  console.error("Error in demo:", err);
  process.exit(1);
});
