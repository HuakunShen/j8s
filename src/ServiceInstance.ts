import { CronJob } from "cron";

import type { IService } from "./interface";
import type { ServiceConfig } from "./types";
import { createServiceConnection, type ServiceConnection } from "./worker";

/**
 * Internal state of a service instance.
 */
export type ServiceStatus =
  | "idle" // created, not yet started
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed";

export class ServiceInstance {
  readonly config: ServiceConfig;
  private worker?: Worker;
  private connection?: ServiceConnection;
  private api?: IService;
  private status: ServiceStatus = "idle";

  // Cron related
  private cronTask?: CronJob;
  private timeoutHandle?: ReturnType<typeof setTimeout>;

  private restartCount = 0;
  private intentionallyStopped = false;

  constructor(config: ServiceConfig) {
    this.config = {
      longRunning: true,
      restartPolicy: "no",
      ...config,
    };

    // Validate that we have either script or worker
    if (!this.config.script && !this.config.worker) {
      throw new Error(
        `Service '${this.config.name}' must have either 'script' or 'worker' specified`,
      );
    }

    // If worker is already provided, use it directly
    if (this.config.worker) {
      this.worker = this.config.worker;
    }

    // Schedule cron jobs for short-lived services if requested
    if (!this.config.longRunning && this.config.cron) {
      this.cronTask = new CronJob(this.config.cron, () => {
        void this.runJob();
      });
      // Start it immediately
      this.cronTask.start();
    }
  }

  getStatus(): ServiceStatus {
    return this.status;
  }

  /**
   * Starts (or restarts) the underlying worker and invokes `start()` on the service.
   */
  async start(): Promise<void> {
    if (this.status === "running" || this.status === "starting") return;
    this.status = "starting";
    this.intentionallyStopped = false;

    // Create worker if not already created
    if (!this.worker) {
      if (!this.config.script) {
        throw new Error(
          `Service '${this.config.name}' has no script or worker specified`,
        );
      }
      // Spawn worker from script
      this.worker = new Worker(
        new URL(this.config.script, import.meta.url).href,
        {
          type: "module",
        },
      );
    }

    // Worker error listener – covers both Web Worker and Node worker_threads
    (this.worker as any).addEventListener?.("error", (err: ErrorEvent) => {
      console.error(`[Service ${this.config.name}] worker error`, err);
      this.status = "crashed";
      this.maybeRestart();
    });

    // Handle exit/close depending on the environment (Node, Bun, Web)
    const exitHandler = (code: number) => {
      this.handleWorkerExit(code);
    };

    // Node.js worker_threads uses "exit" event via .on()
    if (typeof (this.worker as any).on === "function") {
      (this.worker as any).on("exit", exitHandler);
    }

    // Bun/Web standard doesn't have "exit" but emits "close" or "error"? We'll try close.
    (this.worker as any).addEventListener?.("close", () => exitHandler(0));

    // Create connection to the worker using our helper
    this.connection = createServiceConnection(this.worker);
    this.api = this.connection.api;

    try {
      await this.api.start();
      this.status = "running";
    } catch (e) {
      console.error(`[Service ${this.config.name}] failed to start`, e);
      this.status = "crashed";
      this.maybeRestart();
    }
  }

  async stop(): Promise<void> {
    if (this.status !== "running" && this.status !== "starting") return;
    this.status = "stopping";
    this.intentionallyStopped = true;

    try {
      await this.api?.stop();
    } catch (e) {
      console.warn(`[Service ${this.config.name}] error during stop():`, e);
    }

    // Tear down connection
    await this.connection?.destroy();
    this.worker = undefined;
    this.connection = undefined;
    this.api = undefined;

    this.status = "stopped";
  }

  /**
   * For short-lived jobs triggered by cron. It starts a fresh worker, waits
   * until it exits or times out.
   */
  private async runJob(): Promise<void> {
    await this.start();

    if (this.config.timeout && this.status === "running") {
      this.timeoutHandle = setTimeout(() => {
        console.warn(
          `[Service ${this.config.name}] timeout exceeded, terminating job.`,
        );
        void this.stop();
      }, this.config.timeout);
    }

    // For short-lived job we wait until the worker exits (naturally) and then cleanup
    return new Promise<void>((resolve) => {
      const finalize = () => {
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = undefined;
        }
        resolve();
      };

      this.worker?.addEventListener("exit", finalize, { once: true } as any);
    });
  }

  private handleWorkerExit(exitCode: number): void {
    if (this.status === "stopping" || this.status === "stopped") {
      this.status = "stopped";
      return;
    }

    if (exitCode === 0) {
      this.status = "stopped";
    } else {
      this.status = "crashed";
    }
    this.maybeRestart(exitCode);
  }

  private maybeRestart(exitCode = 1): void {
    const policy = this.config.restartPolicy ?? "no";
    const shouldRestart = (() => {
      if (policy === "no") return false;
      if (policy === "always") return true;
      if (policy === "unless-stopped") return !this.intentionallyStopped;
      if (typeof policy === "object" && policy.type === "on-failure") {
        if (exitCode === 0) return false;
        if (policy.maxRetries == null) return true;
        return this.restartCount < policy.maxRetries;
      }
      return false;
    })();

    if (shouldRestart) {
      this.restartCount += 1;
      console.log(
        `[Service ${this.config.name}] restarting (#${this.restartCount})...`,
      );
      setTimeout(() => {
        void this.start();
      }, 1000);
    }
  }
}
