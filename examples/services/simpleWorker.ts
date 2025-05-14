import { expose } from "../../index";
import type { HealthCheckResult, IService } from "../../src/interface";

/**
 * A simple worker service that runs a counter task
 * This demonstrates the simplified worker service creation with the expose function
 */
class CounterService implements IService {
  name = "counter-service";
  private running = false;
  private count = 0;
  private maxCount = 10;
  private interval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log("CounterService started");
    this.running = true;
    this.count = 0;

    // Run a counter task
    this.interval = setInterval(() => {
      this.count++;
      console.log(`Count: ${this.count}`);

      // Stop when reached max count
      if (this.count >= this.maxCount) {
        this.running = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        console.log("CounterService completed task");
      }
    }, 1000);
  }

  async stop(): Promise<void> {
    console.log("CounterService stopped");
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.running ? "running" : "stopped",
      details: {
        currentCount: this.count,
        maxCount: this.maxCount,
        progress: `${this.count}/${this.maxCount}`,
      },
    };
  }
}

// Expose the service - no need for manual RPC setup
expose(new CounterService());
