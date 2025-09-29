import { Effect } from "effect";
import type { IService, HealthCheckResult } from "./interface";

/**
 * An internal adapter responsible for converting a class-based IService
 * into an Effect program that the ServiceManager can run.
 *
 * This hybrid approach uses traditional Promise-based service execution
 * while providing Effect-based APIs for service management.
 */
export class IServiceAdapter {
  readonly healthCheck: Effect.Effect<HealthCheckResult, Error>;
  private started = false;
  private startPromise: Promise<void> | null = null;

  constructor(public readonly service: IService) {
    this.healthCheck = Effect.tryPromise({
      try: () => this.service.healthCheck(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
  }

  /**
   * Start the service using traditional Promise-based approach
   * This maintains compatibility with existing service implementations
   */
  async start(): Promise<void> {
    if (this.started || this.startPromise) {
      return this.startPromise || Promise.resolve();
    }

    this.startPromise = this.service.start();
    await this.startPromise;
    this.started = true;
  }

  /**
   * Stop the service gracefully
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      await this.service.stop();
    } catch (error) {
      console.error("Error during service stop:", error);
      this.started = false;
      this.startPromise = null;
      throw error; // Re-throw to allow ServiceManager to handle
    }

    this.started = false;
    this.startPromise = null;
  }

  /**
   * Check if the service is currently started
   */
  isStarted(): boolean {
    return this.started;
  }
}
