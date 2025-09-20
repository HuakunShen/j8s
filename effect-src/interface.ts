import type * as Cron from "effect/Cron";
import type * as Duration from "effect/Duration";
import type * as EffectPrimitive from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import type * as Stream from "effect/Stream";
import type * as Schedule from "effect/Schedule";

export type ServiceStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "unhealthy";

export type RestartPolicy = "always" | "unless-stopped" | "on-failure" | "no";

export interface HealthCheckResult {
  status: ServiceStatus;
  details?: Record<string, unknown>;
}

export interface EffectService<R = never, E = never> {
  name: string;
  start: EffectPrimitive.Effect<void, E, R>;
  stop: EffectPrimitive.Effect<void, E, R>;
  healthCheck: EffectPrimitive.Effect<HealthCheckResult, E, R>;
}

export interface CronJobConfig {
  readonly schedule: Cron.Cron | string;
  readonly timeout?: Duration.DurationInput;
}

export interface ServiceConfig {
  readonly restartPolicy?: RestartPolicy;
  readonly maxRetries?: number;
  readonly retrySchedule?: Schedule.Schedule<unknown, unknown, number>;
  readonly cron?: CronJobConfig;
  readonly startTimeout?: Duration.DurationInput;
  readonly stopTimeout?: Duration.DurationInput;
}

export interface ServiceRuntimeState {
  readonly status: ServiceStatus;
  readonly lastError?: unknown;
  readonly restarts: number;
  readonly cronFiber?: Fiber.RuntimeFiber<void, unknown>;
}

export interface ServiceManagerSnapshot {
  readonly services: ReadonlyMap<string, ServiceRuntimeState>;
}

export type ServiceEvent =
  | { readonly _tag: "Registered"; readonly name: string; readonly config: ServiceConfig }
  | { readonly _tag: "Deregistered"; readonly name: string }
  | { readonly _tag: "StatusChanged"; readonly name: string; readonly status: ServiceStatus }
  | {
      readonly _tag: "Failed";
      readonly name: string;
      readonly cause: unknown;
      readonly restarts: number;
    }
  | { readonly _tag: "CronTick"; readonly name: string };

export type ManagerEffect<A, E = unknown, R = never> = EffectPrimitive.Effect<A, E, R>;

export interface EffectServiceManager {
  readonly register: <R, E>(
    service: EffectService<R, E>,
    config?: ServiceConfig
  ) => ManagerEffect<void>;
  readonly deregister: (name: string) => ManagerEffect<void>;
  readonly start: (name: string) => ManagerEffect<void>;
  readonly stop: (name: string) => ManagerEffect<void>;
  readonly restart: (name: string) => ManagerEffect<void>;
  readonly health: (name: string) => ManagerEffect<HealthCheckResult>;
  readonly snapshot: ManagerEffect<ServiceManagerSnapshot>;
  readonly startAll: ManagerEffect<void>;
  readonly stopAll: ManagerEffect<void>;
  readonly events: Stream.Stream<ServiceEvent>;
}
