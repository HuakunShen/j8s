declare module "@effect/experimental" {
  import type * as Layer from "effect/Layer";
  export const DevTools: {
    layer: () => Layer.Layer<never, never, never>;
  };
}

declare module "@effect/platform-node" {
  import type * as Effect from "effect/Effect";
  export const NodeRuntime: {
    runMain: <A, E, R>(self: Effect.Effect<A, E, R>) => Promise<void>;
  };
  export const NodeSocket: unknown;
}
