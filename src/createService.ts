import { Effect } from "effect";
import type { HealthCheckResult, IService } from "./interface";

export interface ServiceDefinition {
  name: string;
  start: () => Effect.Effect<void, unknown>;
  stop?: () => Effect.Effect<void, unknown>;
  healthCheck?: () => Effect.Effect<HealthCheckResult, unknown>;
}

export function createService(definition: ServiceDefinition): IService {
  return {
    name: definition.name,
    start: definition.start,
    stop: definition.stop ?? (() => Effect.void),
    healthCheck:
      definition.healthCheck ??
      (() =>
        Effect.succeed({
          status: "stopped",
          details: {},
        })),
  };
}
