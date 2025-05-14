import { expose, type HealthCheckResult, type IService } from "../..";

class WorkerFailureService implements IService {
  name = "workerFailureService";
  private isRunning = false;
  private isStopped = false;
  private startTime = 0;

  async start(): Promise<void> {
    console.log("WorkerFailureService started");
    this.isRunning = true;
    this.isStopped = false;
    this.startTime = Date.now();

    // Long-running task that may randomly fail
    await this.runLongRunningTask();

    console.log("WorkerFailureService task completed");
  }

  async stop(): Promise<void> {
    console.log("WorkerFailureService stopping");
    this.isStopped = true;
    this.isRunning = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
      },
    };
  }

  // Simulates a long-running task that may fail
  private async runLongRunningTask(): Promise<void> {
    let count = 0;

    // Run until stopped or until it fails
    while (!this.isStopped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      count++;
      console.log(`Worker iteration ${count}`);

      const random = Math.random();
      console.log(`Worker random number: ${random}`);

      // Randomly fail (for demonstration purposes)
      if (random < 0.4) {
        // 10% chance of failure
        throw new Error(`Worker random failure at iteration ${count}`);
      }

      // If we reach 10 iterations, end the task naturally
      if (count >= 10) {
        console.log("Worker task completed successfully after 10 iterations");
        return;
      }
    }

    console.log("Worker task stopped gracefully");
  }
}

// Expose the service using the simplified expose function
expose(new WorkerFailureService());
