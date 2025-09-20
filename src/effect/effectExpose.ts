import { Runtime } from "effect";
import { parentPort } from "worker_threads";
import {
  RPCChannel,
  WorkerChildIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IEffectService } from "./interfaces";

/**
 * Exposes an Effect-based service implementation in a worker thread.
 * This function handles all the boilerplate code needed to expose an Effect service
 * implementation through RPC to the main thread.
 *
 * @param service - The Effect service implementation to expose
 * @param runtime - Optional Effect runtime to use (defaults to defaultRuntime)
 */
export function effectExpose(service: IEffectService, runtime?: Runtime.Runtime<never>): void {
  if (!parentPort) {
    throw new Error("effectExpose can only be called in a worker thread");
  }

  const effectRuntime = runtime || Runtime.defaultRuntime;

  // Create IO interface and RPC channel
  const io: DestroyableIoInterface = new WorkerChildIO();

  // Wrap the Effect service to work with the RPC system
  const wrappedService = {
    name: service.name,

    start: async () => {
      const effect = service.start();
      return Runtime.runPromise(effectRuntime)(effect);
    },

    stop: async () => {
      const effect = service.stop();
      return Runtime.runPromise(effectRuntime)(effect);
    },

    healthCheck: async () => {
      const effect = service.healthCheck();
      return Runtime.runPromise(effectRuntime)(effect);
    },
  };

  // Create RPC channel and expose the wrapped service
  const rpc = new RPCChannel<typeof wrappedService, object, DestroyableIoInterface>(io, {
    expose: wrappedService,
  });
}