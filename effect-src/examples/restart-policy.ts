import { Effect, Fiber, Stream } from "effect";
import type { EffectService } from "../interface";
import { makeServiceManager } from "../ServiceManager";

const restartDemoService: EffectService<never, Error> = (() => {
  let stopped = false;

  return {
    name: "restart-demo",
    start: Effect.gen(function* () {
      stopped = false;
      let iteration = 0;

      while (!stopped) {
        iteration += 1;
        yield* Effect.sleep("1 second");
        const random = yield* Effect.sync(Math.random);
        yield* Effect.log(
          `restart-demo iteration=${iteration} random=${random.toFixed(2)}`
        );

        if (random < 0.4) {
          yield* Effect.fail(new Error(`failure at iteration ${iteration}`));
        }

        if (iteration >= 10) {
          yield* Effect.log("restart-demo completed cleanly");
          return;
        }
      }
    }),
    stop: Effect.sync(() => {
      stopped = true;
    }),
    healthCheck: Effect.succeed({ status: "idle", details: { stopped } }),
  };
})();

const program = Effect.gen(function* () {
  const manager = yield* makeServiceManager;

  const eventsFiber = yield* Effect.forkDaemon(
    Stream.runForEach(manager.events, (event) =>
      Effect.log(`event -> ${event._tag} ${"name" in event ? event.name : ""}`)
    )
  );

  yield* manager.register(restartDemoService, {
    restartPolicy: "on-failure",
    maxRetries: 3,
  });

  yield* manager.start("restart-demo");
  yield* Effect.log("restart-demo started; observing for 45 seconds");
  yield* Effect.sleep("45 seconds");

  yield* manager.stop("restart-demo");
  yield* Fiber.interrupt(eventsFiber);
  yield* Effect.log("restart-policy demo complete");
});

await Effect.runPromise(program);
