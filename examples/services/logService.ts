import { Effect } from "effect";
import { expose } from "../../index";
import type { HealthCheckResult, IService } from "../../src/interface";

class LoggingService implements IService {
  name = "loggingService";
  private isRunning = false;
  private logInterval: NodeJS.Timeout | null = null;
  private startTime = 0;

  start() {
    return Effect.sync(() => {
      console.log("loggingService started");
      this.isRunning = true;
      this.startTime = Date.now();

      let count = 0;
      this.logInterval = setInterval(() => {
        console.log("loggingService log", count++);
      }, 1000);
    });
  }

  stop() {
    return Effect.sync(() => {
      console.log("loggingService stopped");
      this.isRunning = false;

      if (this.logInterval) {
        clearInterval(this.logInterval);
        this.logInterval = null;
      }
    });
  }

  healthCheck() {
    return Effect.succeed<HealthCheckResult>({
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
        logs: "healthy",
      },
    });
  }
}

// Expose the service using the simplified expose function
expose(new LoggingService());
