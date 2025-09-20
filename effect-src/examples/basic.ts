import { DevTools } from "@effect/experimental";
import * as Otlp from "@effect/opentelemetry/Otlp";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { NodeRuntime } from "@effect/platform-node";
import { Effect, Fiber, Layer, Stream } from "effect";
import type { EffectService } from "../interface";
import { makeServiceManager } from "../ServiceManager";

const simpleService: EffectService = (() => {
  let workerFiber: Fiber.RuntimeFiber<void, unknown> | null = null;

  return {
    name: "simple-service",
    start: Effect.gen(function* () {
      yield* Effect.log("starting simple-service");
      workerFiber = yield* Effect.forkDaemon(
        Effect.forever(
          Effect.gen(function* () {
            yield* Effect.sleep("5 seconds");
            yield* Effect.log("simple-service heartbeat");
          })
        )
      );
    }),
    stop: Effect.gen(function* () {
      yield* Effect.log("stopping simple-service");
      if (workerFiber) {
        yield* Fiber.interrupt(workerFiber);
        workerFiber = null;
      }
      yield* Effect.log("simple-service stopped");
    }),
    healthCheck: Effect.succeed({ status: "idle", details: {} }),
  };
})();

const cronService: EffectService = {
  name: "cron-job",
  start: Effect.gen(function* () {
    const now = new Date().toISOString();
    yield* Effect.log(`cron-job running at ${now}`);
    yield* Effect.sleep("2 seconds");
    yield* Effect.log(`cron-job finished at ${new Date().toISOString()}`);
  }),
  stop: Effect.log("cron-job stop invoked"),
  healthCheck: Effect.succeed({ status: "idle", details: {} }),
};

const flakyService: EffectService<never, Error> = (() => {
  let attempts = 0;

  return {
    name: "flaky-service",
    start: Effect.gen(function* () {
      attempts += 1;
      yield* Effect.log(`flaky-service attempt ${attempts}`);
      if (attempts < 3) {
        yield* Effect.fail(new Error("simulated failure"));
      }
      yield* Effect.sleep("1 second");
      yield* Effect.log("flaky-service succeeded");
    }),
    stop: Effect.log("flaky-service stop invoked"),
    healthCheck: Effect.succeed({ status: "idle", details: { attempts } }),
  };
})();

const mainProgram = Effect.gen(function* () {
  const manager = yield* makeServiceManager;

  const eventFiber = yield* Effect.forkDaemon(
    Stream.runForEach(manager.events, (event) =>
      Effect.log(`manager event -> ${event._tag} ${"name" in event ? event.name : ""}`)
    )
  );

  yield* manager.register(simpleService, {
    restartPolicy: "unless-stopped",
  });

  yield* manager.register(cronService, {
    cron: { schedule: "*/10 * * * * *", timeout: "10 seconds" },
  });

  yield* manager.register(flakyService, {
    restartPolicy: "on-failure",
    maxRetries: 5,
    startTimeout: "5 seconds",
  });

  yield* manager.startAll;
  yield* Effect.log("services started; running for 35 seconds");
  yield* Effect.sleep("35 seconds");

  yield* manager.stopAll;
  yield* Fiber.interrupt(eventFiber);
  yield* Effect.log("demo complete");
});

const otlpBaseUrl =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
  process.env.OTLP_HTTP_ENDPOINT ??
  "http://localhost:4318";

const otlpResource = {
  serviceName: process.env.OTEL_SERVICE_NAME ?? "j8s-example-basic",
  serviceVersion: process.env.npm_package_version ?? "0.0.0",
  attributes: {
    environment: process.env.NODE_ENV ?? "development",
  },
};

const OtlpLive = Layer.provide(
  Otlp.layer({
    baseUrl: otlpBaseUrl,
    resource: otlpResource,
    loggerExcludeLogSpans: true,
  }),
  NodeHttpClient.layerUndici
);

mainProgram.pipe(
  Effect.provide(OtlpLive),
  Effect.provide(DevTools.layer()),
  NodeRuntime.runMain
);
