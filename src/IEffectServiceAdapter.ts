import { Effect } from "effect";
import type { IEffectService } from "./IEffectService";
import type { HealthCheckResult } from "./interface";

/**
 * Adapter that converts IEffectService to IService interface
 * This allows Effect-based services to work with ServiceManager
 */
export class IEffectServiceAdapter {
  constructor(public readonly service: IEffectService) {}

  async start(): Promise<void> {
    await Effect.runPromise(this.service.startEffect());
  }

  async stop(): Promise<void> {
    await Effect.runPromise(this.service.stopEffect());
  }

  get healthCheck(): Effect.Effect<HealthCheckResult, Error> {
    return this.service.healthCheckEffect();
  }

  async restart(): Promise<void> {
    if (this.service.restartEffect) {
      await Effect.runPromise(this.service.restartEffect());
    } else {
      // Fallback: stop then start
      await this.stop();
      await this.start();
    }
  }
}
