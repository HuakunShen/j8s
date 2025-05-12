import { ServiceInstance, type ServiceStatus } from "./ServiceInstance";
import type { ServiceConfig } from "./types";

/**
 * ServiceManager orchestrates multiple ServiceInstances. It offers convenient
 * batch operations (startAll/stopAll) and per-service controls. It is *not* a
 * singleton—create as many managers as you need.
 */
export class ServiceManager {
  private services = new Map<string, ServiceInstance>();

  /**
   * Register a service by its configuration. If a service with the same name
   * exists it will be overwritten (and stopped first).
   */
  register(config: ServiceConfig): ServiceInstance {
    const existing = this.services.get(config.name);
    if (existing) {
      console.warn(
        `[ServiceManager] Service '${config.name}' already registered, overwriting.`,
      );
      void existing.stop();
    }
    const instance = new ServiceInstance(config);
    this.services.set(config.name, instance);
    return instance;
  }

  /** Get an instance by name. */
  get(name: string): ServiceInstance | undefined {
    return this.services.get(name);
  }

  /** Remove a service (optionally stopping it first). */
  async remove(
    name: string,
    opts: { stop?: boolean } = { stop: true },
  ): Promise<void> {
    const inst = this.services.get(name);
    if (!inst) return;
    if (opts.stop) {
      await inst.stop();
    }
    this.services.delete(name);
  }

  /**
   * Start one service.
   */
  async start(name: string): Promise<void> {
    const inst = this.services.get(name);
    if (!inst) throw new Error(`Service '${name}' not found`);
    await inst.start();
  }

  /** Stop one service. */
  async stop(name: string): Promise<void> {
    const inst = this.services.get(name);
    if (!inst) throw new Error(`Service '${name}' not found`);
    await inst.stop();
  }

  /** Start every registered service (parallel). */
  async startAll(): Promise<void> {
    await Promise.all(Array.from(this.services.values(), (s) => s.start()));
  }

  /** Stop every registered service (parallel). */
  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.services.values(), (s) => s.stop()));
  }

  /** Get health status map. */
  status(): Record<string, ServiceStatus> {
    const res: Record<string, ServiceStatus> = {};
    for (const [name, inst] of this.services) {
      res[name] = inst.getStatus();
    }
    return res;
  }

  /** List registered service names. */
  list(): string[] {
    return Array.from(this.services.keys());
  }
}
