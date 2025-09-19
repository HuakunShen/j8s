import { Effect } from "effect";
import type { HealthCheckResult, IService } from "./interface";

/**
 * Abstract base class for services.
 * Status management is handled by the ServiceManager.
 */
export abstract class BaseService implements IService {
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  protected abstract onStart(): Effect.Effect<void, unknown>;
  protected abstract onStop(): Effect.Effect<void, unknown>;

  protected onHealthCheck(): Effect.Effect<HealthCheckResult, unknown> {
    return Effect.succeed({
      status: "stopped",
      details: {},
    });
  }

  public start(): Effect.Effect<void, unknown> {
    return this.onStart();
  }

  public stop(): Effect.Effect<void, unknown> {
    return this.onStop();
  }

  public healthCheck(): Effect.Effect<HealthCheckResult, unknown> {
    return this.onHealthCheck();
  }
}
