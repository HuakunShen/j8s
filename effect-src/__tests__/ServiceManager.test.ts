import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type { EffectService } from "../interface";
import { makeServiceManager } from "../ServiceManager";

describe("EffectServiceManager", () => {
  it("registers, starts, stops, and reports service health", async () => {
    const manager = await Effect.runPromise(makeServiceManager);
    const events: string[] = [];

    const service: EffectService = {
      name: "demo",
      start: Effect.sync(() => {
        events.push("start");
      }),
      stop: Effect.sync(() => {
        events.push("stop");
      }),
      healthCheck: Effect.succeed({
        status: "idle",
        details: {},
      }),
    };

    await Effect.runPromise(manager.register(service));
    await Effect.runPromise(manager.start(service.name));
    await Effect.runPromise(manager.stop(service.name));

    expect(events).toEqual(["start", "stop"]);

    const health = await Effect.runPromise(manager.health(service.name));
    expect(health.status).toBe("stopped");
    expect(health.details?.restarts).toBe(0);
  });

  it("rejects duplicate service registrations", async () => {
    const manager = await Effect.runPromise(makeServiceManager);

    const service: EffectService = {
      name: "duplicate",
      start: Effect.sync(() => {}),
      stop: Effect.sync(() => {}),
      healthCheck: Effect.succeed({
        status: "idle",
        details: {},
      }),
    };

    await Effect.runPromise(manager.register(service));

    await expect(
      Effect.runPromise(manager.register(service))
    ).rejects.toThrow("Service with name 'duplicate' already exists");
  });
});
