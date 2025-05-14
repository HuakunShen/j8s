import { BaseService, ServiceManager, type HealthCheckResult } from "j8s";

// Create a service that runs in the main thread as a long-running task
class MyService extends BaseService {
  private isStopped = false;

  async start(): Promise<void> {
    console.log("Service started");
    this.isStopped = false;

    // Long-running task that continues until stop() is called
    // or until it completes naturally or fails
    await this.runLongRunningTask();

    console.log("Long-running task completed");
  }

  async stop(): Promise<void> {
    console.log("Service stopping");
    this.isStopped = true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running", // This will be overridden by ServiceManager
      details: {
        isRunning: !this.isStopped,
      },
    };
  }

  // Simulates a long-running task
  private async runLongRunningTask(): Promise<void> {
    let count = 0;

    // Run until stopped or until it fails
    while (!this.isStopped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      count++;
      console.log(`Running iteration ${count}`);
      const random = Math.random();
      console.log(`Random number: ${random}`);
      // Randomly fail (for demonstration purposes)
      if (random < 0.4) {
        // 10% chance of failure
        throw new Error(`Random failure at iteration ${count}`);
      }

      // If we reach 10 iterations, end the task naturally
      if (count >= 10) {
        console.log("Task completed successfully after 10 iterations");
        return;
      }
    }

    console.log("Task stopped gracefully");
  }
}

// Create a service manager
const manager = new ServiceManager();

// Add the service
const myService = new MyService("my-service");
manager.addService(myService, {
  // restartPolicy: "always", // Will restart on any failure
  restartPolicy: "on-failure",
  maxRetries: 3,
});

// Start the service
await manager.startAllServices();

// Keep the process running to observe background failures and restarts
console.log("Service manager is running. Press Ctrl+C to exit.");
