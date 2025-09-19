# j8s - Effect-first JavaScript Service Orchestrator

[j8s](https://jsr.io/@hk/j8s) lets you compose multiple services inside a single
process and supervise them with the [Effect](https://effect.website) runtime.
Every lifecycle operation (`start`, `stop`, health checks) is modelled as an
`Effect`, giving you type-safe error handling, structured concurrency and an easy
bridge to promises when you need it.

## Key features

- ✅ **Effect-powered lifecycles** – author services with `Effect` and run them
  through a `ServiceManager`
- 🔁 **Typed restart policies** – `"always"`, `"unless-stopped"`,
  `"on-failure"` (with exponential back-off) and `"no"`
- 🧵 **Worker thread services** – spawn `Worker` based services via RPC
- ⏰ **Cron scheduling** – trigger services on a cron expression with optional
  timeouts
- 📡 **Drop-in REST API** – expose management endpoints (OpenAPI + Scalar UI)

## Quick start

```ts
import { Duration, Effect } from "effect";
import { ServiceManager, createService } from "j8s";

const heartbeat = createService({
  name: "heartbeat",
  start: () =>
    Effect.gen(function* () {
      while (true) {
        console.log("💓 heartbeat");
        yield* Effect.sleep(Duration.seconds(5));
      }
    }),
});

const manager = new ServiceManager();
manager.addService(heartbeat, { restartPolicy: "always" });

await Effect.runPromise(manager.startService("heartbeat"));
// … later
await Effect.runPromise(manager.stopService("heartbeat"));
```

All manager operations return an `Effect`. Use `Effect.runPromise` (or
`Effect.runFork`) when calling them from promise-based code.

## Defining services

You can create services either with the functional `createService` helper or by
extending `BaseService` when you prefer an object-oriented approach.

### `createService`

```ts
import { Duration, Effect } from "effect";
import { createService } from "j8s";

const metrics = createService({
  name: "metrics",
  start: () =>
    Effect.gen(function* () {
      yield* Effect.sleep(Duration.seconds(1));
      console.log("collecting metrics…");
      yield* Effect.never; // run until interrupted
    }),
  stop: () => Effect.sync(() => console.log("metrics stopped")),
  healthCheck: () =>
    Effect.succeed({
      status: "running",
      details: { timestamp: Date.now() },
    }),
});
```

### `BaseService`

Override `protected onStart()`, `onStop()` and optionally `onHealthCheck()` with
`Effect` programs:

```ts
import { Duration, Effect } from "effect";
import { BaseService } from "j8s";

class BackupService extends BaseService {
  constructor() {
    super("backup");
  }

  protected onStart() {
    return Effect.gen(function* () {
      console.log("Running backup");
      yield* Effect.sleep(Duration.seconds(2));
    });
  }

  protected onStop() {
    return Effect.sync(() => console.log("Backup stopped"));
  }
}
```

## Restart policies & options

```ts
const manager = new ServiceManager({ backoffBaseMs: 250, backoffMaxMs: 5_000 });
manager.addService(job, {
  restartPolicy: "on-failure",
  maxRetries: 5,
});
```

`ServiceManager` automatically tracks crashes and completions:

| Policy            | Behaviour                                                     |
| ----------------- | ------------------------------------------------------------- |
| `"always"`        | Restart immediately after every completion or crash           |
| `"unless-stopped"` | Restart after completion/crash unless you called `stopService`|
| `"on-failure"`    | Exponential back-off, up to `maxRetries` crashes              |
| `"no"`            | Never restart automatically                                   |

Back-off timings can be customised through the manager options shown above.

## Worker services

Wrap worker threads with the built-in RPC helper:

```ts
import { Effect } from "effect";
import { ServiceManager, createWorkerService } from "j8s";

const worker = createWorkerService(
  "thumbnailer",
  new URL("./worker.ts", import.meta.url),
  { autoTerminate: false }
);

const manager = new ServiceManager();
manager.addService(worker, { restartPolicy: "on-failure", maxRetries: 3 });
await Effect.runPromise(manager.startService("thumbnailer"));
```

Inside `worker.ts` expose an `IService` implemented with `Effect`:

```ts
import { Effect } from "effect";
import { expose, type IService } from "j8s";

class WorkerService implements IService {
  name = "thumbnailer";
  private running = false;

  start() {
    return Effect.sync(() => {
      this.running = true;
      console.log("worker online");
    });
  }

  stop() {
    return Effect.sync(() => {
      this.running = false;
    });
  }

  healthCheck() {
    return Effect.succeed({ status: this.running ? "running" : "stopped" });
  }
}

expose(new WorkerService());
```

## Cron jobs

Attach a cron schedule when adding a service. The service is started whenever the
cron expression fires and optionally stopped after a timeout.

```ts
manager.addService(reportingService, {
  cronJob: {
    schedule: "0 */6 * * *", // every six hours
    timeout: 60_000,
  },
});
```

## REST API

Use the `createServiceManagerAPI` helper to expose management endpoints powered
by [Hono](https://hono.dev/):

```ts
import { serve } from "@hono/node-server";
import { Effect } from "effect";
import { ServiceManager, createService } from "j8s";
import { createServiceManagerAPI } from "j8s/api";

const manager = new ServiceManager();
manager.addService(
  createService({
    name: "ping",
    start: () => Effect.never,
  })
);

const app = createServiceManagerAPI(manager, {
  openapi: { enabled: true },
  scalar: { enabled: true },
});

serve({ fetch: app.fetch, port: 3000 });
```

All handlers inside the generated API already bridge through `Effect.runPromise`,
so you can call them from regular HTTP clients.

## Health checks

`ServiceManager.healthCheckService(name)` returns the service's own details but
always overrides the status with the supervised state (`running`, `stopped`,
`crashed`, etc.). Combine this with custom data returned by your services to build
rich observability dashboards.

## Testing utilities

The repository ships with Vitest/Bun tests demonstrating restart behaviour and
cron scheduling. Run them with `bun test`.

---

Questions or feedback? Open an issue on the project repo!
