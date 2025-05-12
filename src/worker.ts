import {
  RPCChannel,
  WorkerChildIO,
  WorkerParentIO,
  type DestroyableIoInterface,
} from "@kunkun/kkrpc";
import type { IService } from "./interface";

/**
 * Simplified worker API for service workers.
 * This encapsulates the kkrpc package so users don't need to depend on it directly.
 */
export class ServiceWorker {
  private io: DestroyableIoInterface;
  private rpc: RPCChannel<IService, object, DestroyableIoInterface>;

  /**
   * Creates a new ServiceWorker instance in the worker thread.
   * @param serviceImpl The service implementation to expose
   */
  constructor(serviceImpl: IService) {
    this.io = new WorkerChildIO();
    this.rpc = new RPCChannel<IService, object, DestroyableIoInterface>(
      this.io,
      {
        expose: serviceImpl,
      },
    );
  }
}

/**
 * Helper type to represent the parent side of a service connection
 */
export type ServiceConnection = {
  api: IService;
  destroy: () => Promise<void>;
};

/**
 * Creates a connection to a worker service.
 * @param worker The Worker instance
 * @returns A connection object with the service API and a destroy method
 */
export function createServiceConnection(worker: Worker): ServiceConnection {
  const io = new WorkerParentIO(worker);
  const rpc = new RPCChannel<object, IService, DestroyableIoInterface>(io, {});

  return {
    api: rpc.getAPI(),
    destroy: async () => {
      await io.destroy();
      worker.terminate();
    },
  };
}
