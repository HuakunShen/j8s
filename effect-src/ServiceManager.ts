import { Context, Effect, Layer, pipe } from "effect";
import * as Ref from "effect/Ref";
import type { Ref as RefInstance } from "effect/Ref";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import type { DurationInput } from "effect/Duration";
import type {
  EffectService,
  EffectServiceManager,
  HealthCheckResult,
  ManagerEffect,
  ServiceConfig,
  ServiceManagerSnapshot,
  ServiceRuntimeState,
  ServiceStatus,
  ServiceEvent,
} from "./interface";

interface ServiceEntry {
  readonly service: EffectService<any, any>;
  readonly config: ServiceConfig;
  readonly status: RefInstance<ServiceStatus>;
  readonly restarts: RefInstance<number>;
  readonly lastError: RefInstance<Option.Option<unknown>>;
  readonly loopFiber: RefInstance<Option.Option<Fiber.RuntimeFiber<void, unknown>>>;
  readonly cronFiber: RefInstance<Option.Option<Fiber.RuntimeFiber<void, unknown>>>;
  readonly stopRequested: RefInstance<boolean>;
  readonly retrySchedule: Schedule.Schedule<unknown, unknown, unknown>;
}

const INITIAL_STATUS: ServiceStatus = "idle";

const makeSpanName = (operation: string) => `ServiceManager.${operation}`;

const spanOptions = (
  entry: ServiceEntry | null,
  attributes?: Record<string, unknown>
) => {
  const base = entry
    ? { "service.name": entry.service.name }
    : {};
  return {
    attributes: {
      ...base,
      ...attributes,
    },
  };
};

class ServiceManagerImpl implements EffectServiceManager {
  public readonly events: Stream.Stream<ServiceEvent>;

  constructor(
    private readonly registry: RefInstance<ReadonlyMap<string, ServiceEntry>>,
    private readonly eventsPubSub: PubSub.PubSub<ServiceEvent>
  ) {
    this.events = Stream.fromPubSub(eventsPubSub);
  }

  private emitEvent(event: ServiceEvent): ManagerEffect<void> {
    return Effect.ignore(PubSub.publish(this.eventsPubSub, event));
  }

  private setStatus(entry: ServiceEntry, status: ServiceStatus): ManagerEffect<void> {
    const self = this;
    return Effect.gen(function* () {
      yield* Ref.set(entry.status, status);
      yield* self.emitEvent({
        _tag: "StatusChanged",
        name: entry.service.name,
        status,
      });
    });
  }

  register<R, E>(
    service: EffectService<R, E>,
    config: ServiceConfig = {}
  ): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": service.name,
        "service.restartPolicy": config.restartPolicy ?? "on-failure",
      });

      const current: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      if (current.has(service.name)) {
        return yield* Effect.fail(
          new Error(`Service with name '${service.name}' already exists`)
        );
      }

      const entry = yield* self.makeEntry(service, config);
      const next = new Map(current);
      next.set(service.name, entry);
      yield* Ref.set(self.registry, next);

      yield* self.emitEvent({
        _tag: "Registered",
        name: service.name,
        config,
      });
      yield* self.emitEvent({
        _tag: "StatusChanged",
        name: service.name,
        status: INITIAL_STATUS,
      });

      if (entry.config.cron) {
        yield* self.startCron(entry);
      }
    });

    return program.pipe(
      Effect.withSpan(
        makeSpanName("register"),
        spanOptions(null, { "service.name": service.name })
      )
    );
  }

  deregister(name: string): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": name,
      });

      const entry = yield* self.getEntry(name);
      yield* self.stopEntry(entry);

      const current: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      const next = new Map(current);
      next.delete(name);
      yield* Ref.set(self.registry, next);

      yield* self.emitEvent({
        _tag: "Deregistered",
        name,
      });
    });

    return program.pipe(
      Effect.withSpan(
        makeSpanName("deregister"),
        spanOptions(null, { "service.name": name })
      )
    );
  }

  start(name: string): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      const entry = yield* self.getEntry(name);
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
        "service.hasCron": Boolean(entry.config.cron),
      });
      if (entry.config.cron) {
        yield* self.startCron(entry);
      } else {
        yield* self.startPersistent(entry);
      }
    });

    return program.pipe(
      Effect.withSpan(
        makeSpanName("start"),
        spanOptions(null, { "service.name": name })
      )
    );
  }

  stop(name: string): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      const entry = yield* self.getEntry(name);
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
      });
      yield* self.stopEntry(entry);
    });

    return program.pipe(
      Effect.withSpan(
        makeSpanName("stop"),
        spanOptions(null, { "service.name": name })
      )
    );
  }

  restart(name: string): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": name,
      });
      yield* Effect.ignore(self.stop(name));
      yield* self.start(name);
    });

    return program.pipe(
      Effect.withSpan(
        makeSpanName("restart"),
        spanOptions(null, { "service.name": name })
      )
    );
  }

  health(name: string): ManagerEffect<HealthCheckResult> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": name,
      });
      const entry = yield* self.getEntry(name);
      const status: ServiceStatus = yield* Ref.get(entry.status);
      const restarts: number = yield* Ref.get(entry.restarts);
      const lastError: Option.Option<unknown> = yield* Ref.get(entry.lastError);

      const health = yield* entry.service.healthCheck.pipe(
        Effect.catchAll(() =>
          Effect.succeed<HealthCheckResult>({
            status: "unhealthy",
            details: { reason: "health check threw" },
          })
        )
      );

      return {
        ...health,
        status,
        details: {
          ...health.details,
          restarts,
          lastError: Option.getOrUndefined(lastError),
        },
      };
    });

    return (program.pipe(
      Effect.withSpan(
        makeSpanName("health"),
        spanOptions(null, { "service.name": name })
      )
    ) as unknown) as ManagerEffect<HealthCheckResult>;
  }

  get snapshot(): ManagerEffect<ServiceManagerSnapshot> {
    const self = this;
    const program = Effect.gen(function* () {
      const entries: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      yield* Effect.annotateCurrentSpan({
        "manager.registrySize": entries.size,
      });
      const snapshot = new Map<string, ServiceRuntimeState>();

      for (const [name, entry] of entries) {
        const status: ServiceStatus = yield* Ref.get(entry.status);
        const restarts: number = yield* Ref.get(entry.restarts);
        const lastError: Option.Option<unknown> = yield* Ref.get(
          entry.lastError
        );
        const cronFiber: Option.Option<Fiber.RuntimeFiber<void, unknown>> =
          yield* Ref.get(entry.cronFiber);

        snapshot.set(name, {
          status,
          restarts,
          lastError: Option.getOrUndefined(lastError),
          cronFiber: Option.getOrUndefined(cronFiber),
        });
      }

      return { services: snapshot };
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("snapshot"), spanOptions(null))
    ) as unknown) as ManagerEffect<ServiceManagerSnapshot>;
  }

  get startAll(): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      const entries: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      yield* Effect.annotateCurrentSpan({
        "manager.registrySize": entries.size,
      });
      for (const name of entries.keys()) {
        yield* self.start(name);
      }
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("startAll"), spanOptions(null))
    ) as unknown) as ManagerEffect<void>;
  }

  get stopAll(): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      const entries: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      yield* Effect.annotateCurrentSpan({
        "manager.registrySize": entries.size,
      });
      for (const name of entries.keys()) {
        yield* self.stop(name);
      }
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("stopAll"), spanOptions(null))
    ) as unknown) as ManagerEffect<void>;
  }

  private makeEntry(
    service: EffectService<any, any>,
    config: ServiceConfig
  ): ManagerEffect<ServiceEntry> {
    const self = this;
    return (Effect.gen(function* () {
      const status = yield* Ref.make<ServiceStatus>(INITIAL_STATUS);
      const restarts = yield* Ref.make(0);
      const lastError = yield* Ref.make<Option.Option<unknown>>(Option.none());
      const loopFiber = yield* Ref.make<Option.Option<Fiber.RuntimeFiber<void, unknown>>>(
        Option.none()
      );
      const cronFiber = yield* Ref.make<Option.Option<Fiber.RuntimeFiber<void, unknown>>>(
        Option.none()
      );
      const stopRequested = yield* Ref.make(false);
      const retrySchedule = self.buildRetrySchedule(config);

      return {
        service,
        config,
        status,
        restarts,
        lastError,
        loopFiber,
        cronFiber,
        stopRequested,
        retrySchedule,
      } satisfies ServiceEntry;
    }) as unknown) as ManagerEffect<ServiceEntry>;
  }

  private getEntry(name: string): ManagerEffect<ServiceEntry> {
    const self = this;
    return (Effect.gen(function* () {
      const current: ReadonlyMap<string, ServiceEntry> = yield* Ref.get(
        self.registry
      );
      const entry = current.get(name);
      if (!entry) {
        return yield* Effect.fail(new Error(`Service '${name}' not found`));
      }
      return entry;
    }) as unknown) as ManagerEffect<ServiceEntry>;
  }

  private startPersistent(entry: ServiceEntry): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
        "service.restartPolicy": entry.config.restartPolicy ?? "on-failure",
      });
      const running: Option.Option<Fiber.RuntimeFiber<void, unknown>> = yield* Ref.get(
        entry.loopFiber
      );
      if (Option.isSome(running)) {
        return;
      }

      yield* Ref.set(entry.stopRequested, false);
      yield* self.setStatus(entry, "starting");

      const program = pipe(
        self.runPersistentProgram(entry),
        Effect.ensuring(Ref.set(entry.loopFiber, Option.none()))
      );

      const fiber = yield* Effect.forkDaemon(program);
      yield* Ref.set(
        entry.loopFiber,
        Option.some<Fiber.RuntimeFiber<void, unknown>>(fiber)
      );
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("startPersistent"), spanOptions(entry))
    ) as unknown) as ManagerEffect<void>;
  }

  private runPersistentProgram(entry: ServiceEntry): ManagerEffect<void> {
    const policy = entry.config.restartPolicy ?? "on-failure";
    const timeout = entry.config.startTimeout;
    const attempt = this.serviceAttempt(entry, {
      timeout,
      successStatus: "stopped",
    });

    if (policy === "no") {
      return (attempt.pipe(
        Effect.withSpan(
          makeSpanName("persistentAttempt"),
          spanOptions(entry, { "service.restartPolicy": policy })
        )
      ) as unknown) as ManagerEffect<void>;
    }

    const program = Effect.retry(attempt, entry.retrySchedule);

    return (program.pipe(
      Effect.withSpan(
        makeSpanName("runPersistentProgram"),
        spanOptions(entry, { "service.restartPolicy": policy })
      )
    ) as unknown) as ManagerEffect<void>;
  }

  private startCron(entry: ServiceEntry): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
        "service.cron": entry.config.cron?.schedule,
      });
      if (!entry.config.cron) {
        return;
      }

      const existing: Option.Option<Fiber.RuntimeFiber<void, unknown>> =
        yield* Ref.get(entry.cronFiber);
      if (Option.isSome(existing)) {
        return;
      }

      yield* Ref.set(entry.stopRequested, false);
      yield* self.setStatus(entry, "idle");

      const program = pipe(
        self.runCronLoop(entry),
        Effect.ensuring(Ref.set(entry.cronFiber, Option.none()))
      );

      const fiber = yield* Effect.forkDaemon(program);
      yield* Ref.set(
        entry.cronFiber,
        Option.some<Fiber.RuntimeFiber<void, unknown>>(fiber)
      );
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("startCron"), spanOptions(entry))
    ) as unknown) as ManagerEffect<void>;
  }

  private runCronLoop(entry: ServiceEntry): ManagerEffect<void> {
    const cronConfig = entry.config.cron;
    if (!cronConfig) {
      return Effect.succeed(undefined);
    }

    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
        "service.cron": cronConfig.schedule,
      });
      const driver = yield* Schedule.driver(
        typeof cronConfig.schedule === "string"
          ? Schedule.cron(cronConfig.schedule)
          : Schedule.cron(cronConfig.schedule)
      );

      while (true) {
        const stopped = yield* Ref.get(entry.stopRequested);
        if (stopped) {
          yield* self.setStatus(entry, "stopped");
          break;
        }

        const next = yield* Effect.either(driver.next(undefined));
        if (next._tag === "Left") {
          break;
        }

        yield* self.emitEvent({
          _tag: "CronTick",
          name: entry.service.name,
        });

        yield* self.setStatus(entry, "starting");

        const timeout = entry.config.cron?.timeout ?? entry.config.startTimeout;
        const attempt = self.serviceAttempt(entry, {
          timeout,
          successStatus: "idle",
        });

        const policy = entry.config.restartPolicy ?? "on-failure";
        const program = policy === "no"
          ? attempt
          : Effect.retry(attempt, entry.retrySchedule);

        yield* program.pipe(
          Effect.withSpan(
            makeSpanName("cronTick"),
            spanOptions(entry, { "service.cron": cronConfig.schedule })
          ),
          Effect.catchAllCause((cause) =>
            Cause.isInterrupted(cause)
              ? Effect.succeed(undefined)
              : Effect.logError(
                `Cron execution for '${entry.service.name}' failed irrecoverably`,
                Cause.pretty(cause)
              )
          )
        );
      }
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("runCronLoop"), spanOptions(entry))
    ) as unknown) as ManagerEffect<void>;
  }

  private stopEntry(entry: ServiceEntry): ManagerEffect<void> {
    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
      });
      yield* Ref.set(entry.stopRequested, true);

      const cronFiber: Option.Option<Fiber.RuntimeFiber<void, unknown>> =
        yield* Ref.get(entry.cronFiber);
      if (Option.isSome(cronFiber)) {
        yield* Fiber.interrupt(cronFiber.value).pipe(Effect.ignore);
        yield* Ref.set(entry.cronFiber, Option.none());
      }

      const loopFiber: Option.Option<Fiber.RuntimeFiber<void, unknown>> =
        yield* Ref.get(entry.loopFiber);
      if (Option.isSome(loopFiber)) {
        yield* Fiber.interrupt(loopFiber.value).pipe(Effect.ignore);
        yield* Ref.set(entry.loopFiber, Option.none());
      }

      const timeout = entry.config.stopTimeout;
      const stopEffect = timeout
        ? Effect.timeoutFail(entry.service.stop, {
            duration: timeout,
            onTimeout: () =>
              new Error(`Service '${entry.service.name}' stop timed out`),
          })
        : entry.service.stop;

      yield* stopEffect.pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError(
            `Stopping service '${entry.service.name}' failed`,
            Cause.pretty(cause)
          )
        )
      );

      yield* self.setStatus(entry, "stopped");
      yield* Ref.set(entry.restarts, 0);
      yield* Ref.set(entry.lastError, Option.none());
    });

    return (program.pipe(
      Effect.withSpan(makeSpanName("stopEntry"), spanOptions(entry))
    ) as unknown) as ManagerEffect<void>;
  }

  private serviceAttempt(
    entry: ServiceEntry,
    options: { timeout?: DurationInput; successStatus: ServiceStatus }
  ): ManagerEffect<void> {
    const timeout = options.timeout;

    const self = this;
    const program = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        "service.name": entry.service.name,
        "service.successStatus": options.successStatus,
        "service.timeout": timeout ?? "none",
      });
      yield* self.setStatus(entry, "running");

      const baseEffect = timeout
        ? Effect.timeoutFail(entry.service.start, {
            duration: timeout,
            onTimeout: () =>
              new Error(
                `Service '${entry.service.name}' start timed out`
              ),
          })
        : entry.service.start;

      const startEffect = baseEffect.pipe(
        Effect.withSpan(
          makeSpanName("serviceStart"),
          spanOptions(entry, {
            "service.successStatus": options.successStatus,
            "service.timeout": timeout ?? "none",
          })
        )
      );

      const exit = yield* Effect.exit(startEffect);

      if (Exit.isSuccess(exit)) {
        yield* Ref.set(entry.lastError, Option.none());
        yield* Ref.set(entry.restarts, 0);
        yield* self.setStatus(entry, options.successStatus);
        yield* Effect.annotateCurrentSpan({
          "service.restarts": 0,
          "service.status": options.successStatus,
        });
        return;
      }

      const cause = exit.cause;
      if (Cause.isInterrupted(cause)) {
        yield* self.setStatus(entry, "stopped");
        yield* Ref.set(entry.restarts, 0);
        yield* Effect.annotateCurrentSpan({
          "service.interrupted": true,
        });
        return;
      }

      const restarts = yield* Ref.updateAndGet(entry.restarts, (count: number) =>
        count + 1
      );
      yield* Ref.set(entry.lastError, Option.some<unknown>(cause));
      yield* self.setStatus(entry, "crashed");
      yield* Effect.annotateCurrentSpan({
        "service.restarts": restarts,
        "service.status": "crashed",
      });
      yield* self.emitEvent({
        _tag: "Failed",
        name: entry.service.name,
        cause,
        restarts,
      });
      yield* Effect.logError(
        `Service '${entry.service.name}' failed`,
        Cause.pretty(cause)
      );

      return yield* Effect.failCause(cause);
    });

    return (program.pipe(
      Effect.withSpan(
        makeSpanName("serviceAttempt"),
        spanOptions(entry, {
          "service.timeout": timeout ?? "none",
          "service.successStatus": options.successStatus,
        })
      )
    ) as unknown) as ManagerEffect<void>;
  }

  private buildRetrySchedule(
    config: ServiceConfig
  ): Schedule.Schedule<unknown, unknown, unknown> {
    if (config.retrySchedule) {
      return config.retrySchedule;
    }

    const base = pipe(
      Schedule.exponential("250 millis"),
      Schedule.jittered
    );

    if (config.restartPolicy === "on-failure") {
      const max = config.maxRetries ?? 3;
      return pipe(base, Schedule.intersect(Schedule.recurs(max)));
    }

    return base;
  }
}

export const ServiceManagerTag = Context.GenericTag<EffectServiceManager>(
  "j8s/effect/ServiceManager"
);

export const makeServiceManagerLayer = Layer.effect(
  ServiceManagerTag,
  Effect.gen(function* () {
    const state = yield* Ref.make<ReadonlyMap<string, ServiceEntry>>(new Map());
    const events = yield* PubSub.unbounded<ServiceEvent>();
    return new ServiceManagerImpl(state, events);
  })
);

export const makeServiceManager = Effect.gen(function* () {
  const state = yield* Ref.make<ReadonlyMap<string, ServiceEntry>>(new Map());
  const events = yield* PubSub.unbounded<ServiceEvent>();
  return new ServiceManagerImpl(state, events);
});
