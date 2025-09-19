import { CronJob } from "cron";
import { Duration, Effect, Exit, Fiber, Option } from "effect";
import type {
  HealthCheckResult,
  IService,
  IServiceManager,
  RestartPolicy,
  ServiceConfig,
  ServiceStatus,
} from "./interface";

interface ServiceEntry {
  service: IService;
  config: ServiceConfig;
  status: ServiceStatus;
  restartCount: number;
  manualStop: boolean;
  runningFiber?: Fiber.RuntimeFiber<void, unknown>;
  restartFiber?: Fiber.RuntimeFiber<void, unknown>;
  cronJob?: CronJob;
  preserveRestartCount?: boolean;
}

const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30000;

export interface ServiceManagerOptions {
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

export class ServiceManager implements IServiceManager {
  private readonly serviceMap = new Map<string, ServiceEntry>();
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  constructor(options: ServiceManagerOptions = {}) {
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  public get services(): IService[] {
    return Array.from(this.serviceMap.values()).map((entry) => entry.service);
  }

  public addService(service: IService, config: ServiceConfig = {}): void {
    if (this.serviceMap.has(service.name)) {
      throw new Error(`Service with name '${service.name}' already exists`);
    }

    const entry: ServiceEntry = {
      service,
      config,
      status: "stopped",
      restartCount: 0,
      manualStop: false,
    };

    this.serviceMap.set(service.name, entry);

    if (config.cronJob) {
      this.setupCronJob(entry);
    }
  }

  public removeService(serviceName: string): void {
    const entry = this.serviceMap.get(serviceName);
    if (!entry) {
      return;
    }

    if (entry.restartFiber) {
      Effect.runFork(Fiber.interrupt(entry.restartFiber));
    }

    if (entry.runningFiber) {
      Effect.runFork(Fiber.interrupt(entry.runningFiber));
    }

    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    this.serviceMap.delete(serviceName);
  }

  public startService(serviceName: string): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const entry = self.serviceMap.get(serviceName);
      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
      }

      if (entry.status === "running") {
        return yield* Effect.fail(
          new Error(`Service '${serviceName}' is already running`)
        );
      }

      entry.manualStop = false;

      if (entry.restartFiber) {
        yield* Fiber.interruptFork(entry.restartFiber);
        entry.restartFiber = undefined;
      }

      entry.status = "running";
      if (entry.preserveRestartCount) {
        entry.preserveRestartCount = false;
      } else {
        entry.restartCount = 0;
      }

      const runEffect = entry.service
        .start()
        .pipe(
          Effect.tap(() => self.handleServiceCompletion(entry)),
          Effect.tapError((error) => self.handleServiceFailure(entry, error)),
          Effect.ensuring(
            Effect.sync(() => {
              entry.runningFiber = undefined;
            })
          )
        );

      const fiber = yield* Effect.forkDaemon(runEffect);
      entry.runningFiber = fiber;

      // Allow the service to execute at least a tick before we inspect it
      yield* Effect.sleep(Duration.millis(0));
      const exitOption = yield* Fiber.poll(fiber);

      if (Option.isSome(exitOption)) {
        const exit = exitOption.value;
        if (Exit.isFailure(exit)) {
          return yield* Effect.failCause(exit.cause);
        }
      }
    });
  }

  public stopService(serviceName: string): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const entry = self.serviceMap.get(serviceName);
      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
      }

      entry.manualStop = true;

      if (entry.restartFiber) {
        yield* Fiber.interruptFork(entry.restartFiber);
        entry.restartFiber = undefined;
      }

      if (entry.cronJob) {
        entry.cronJob.stop();
      }

      if (entry.runningFiber) {
        yield* Fiber.interrupt(entry.runningFiber);
        entry.runningFiber = undefined;
      }

      entry.status = "stopping";

      yield* entry.service
        .stop()
        .pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              console.error(`Error stopping service '${serviceName}':`, error);
              entry.status = "crashed";
            })
          )
        );

      entry.status = "stopped";
      entry.restartCount = 0;
    });
  }

  public restartService(serviceName: string): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      yield* self.stopService(serviceName);
      yield* self.startService(serviceName);
    });
  }

  public healthCheckService(
    serviceName: string
  ): Effect.Effect<HealthCheckResult, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const entry = self.serviceMap.get(serviceName);
      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${serviceName}' not found`));
      }

      const health = yield* entry.service.healthCheck();
      return {
        ...health,
        status: entry.status,
      } satisfies HealthCheckResult;
    });
  }

  public startAllServices(): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.forEach(this.services, (service) =>
      self.startService(service.name)
    ).pipe(Effect.asVoid);
  }

  public stopAllServices(): Effect.Effect<void, unknown> {
    const self = this;
    const services = Array.from(this.serviceMap.values());
    return Effect.forEach(services, (entry) =>
      self
        .stopService(entry.service.name)
        .pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error(
                `Failed to stop service '${entry.service.name}':`,
                error
              );
            })
          )
        )
    ).pipe(Effect.asVoid);
  }

  public healthCheckAllServices(): Effect.Effect<
    Record<string, HealthCheckResult>,
    unknown
  > {
    const self = this;
    return Effect.gen(function* () {
      const result: Record<string, HealthCheckResult> = {};

      for (const [name] of self.serviceMap.entries()) {
        result[name] = yield* self.healthCheckService(name);
      }

      return result;
    });
  }

  private handleServiceCompletion(entry: ServiceEntry): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      entry.status = "stopped";
      const policy: RestartPolicy = entry.config.restartPolicy ?? "on-failure";

      if (
        policy === "always" ||
        (policy === "unless-stopped" && !entry.manualStop)
      ) {
        yield* self.scheduleServiceRestart(entry, "success");
      } else {
        entry.restartCount = 0;
      }
    });
  }

  private handleServiceFailure(
    entry: ServiceEntry,
    error: unknown
  ): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      console.error(`Service '${entry.service.name}' failed:`, error);
      entry.status = "crashed";
      const policy: RestartPolicy = entry.config.restartPolicy ?? "on-failure";

      if (policy !== "no") {
        yield* self.scheduleServiceRestart(entry, "failure");
      }
    });
  }

  private scheduleServiceRestart(
    entry: ServiceEntry,
    reason: "success" | "failure"
  ): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const policy: RestartPolicy = entry.config.restartPolicy ?? "on-failure";

      if (policy === "no") {
        return;
      }

      if (reason === "success") {
        if (policy === "on-failure" || entry.manualStop) {
          return;
        }

        entry.restartCount = 0;
      } else {
        const maxRetries = entry.config.maxRetries ?? 3;
        if (policy === "on-failure" && entry.restartCount >= maxRetries) {
          console.error(
            `Service '${entry.service.name}' exceeded max restart attempts (${maxRetries})`
          );
          entry.status = "crashed";
          return;
        }

        entry.restartCount += 1;
        entry.preserveRestartCount = true;
      }

      if (entry.restartFiber) {
        yield* Fiber.interruptFork(entry.restartFiber);
      }

      const delayMs =
        reason === "failure"
          ? Math.min(
              self.backoffBaseMs * Math.pow(2, entry.restartCount - 1),
              self.backoffMaxMs
            )
          : 0;

      if (delayMs > 0) {
        console.log(
          `Scheduling restart for service '${entry.service.name}' in ${delayMs}ms (attempt ${entry.restartCount})`
        );
      } else {
        console.log(
          `Restarting service '${entry.service.name}' immediately after completion`
        );
      }

      const restartEffect = Effect.sleep(Duration.millis(delayMs)).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            entry.restartFiber = undefined;
          })
        ),
        Effect.zipRight(self.startService(entry.service.name))
      );

      entry.restartFiber = yield* Effect.forkDaemon(restartEffect);
    });
  }

  private setupCronJob(entry: ServiceEntry): void {
    const { cronJob } = entry.config;
    if (!cronJob) {
      return;
    }

    const { service } = entry;

    if (entry.cronJob) {
      entry.cronJob.stop();
    }

    entry.cronJob = new CronJob(cronJob.schedule, () => {
      Effect.runFork(
        this.startService(service.name).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error(
                `Error running cron job for service '${service.name}':`,
                error
              );
              entry.status = "crashed";
            })
          )
        )
      );

      if (cronJob.timeout !== undefined) {
        setTimeout(() => {
          Effect.runFork(
            this.stopService(service.name).pipe(
              Effect.catchAll((error) =>
                Effect.sync(() => {
                  console.error(
                    `Error stopping service '${service.name}' after timeout:`,
                    error
                  );
                  entry.status = "crashed";
                })
              )
            )
          );
        }, cronJob.timeout);
      }
    });

    entry.cronJob.start();
  }
}
