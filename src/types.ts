export type RestartPolicy =
  | "no"
  | "always"
  | "unless-stopped"
  | {
      type: "on-failure";
      /**
       * Maximum number of restart retries. If undefined, retry forever.
       */
      maxRetries?: number;
    };

export interface ServiceConfig {
  /**
   * Unique service name.
   */
  name: string;
  /**
   * Path to the worker script relative to the project root or current file.
   * It will be resolved with `new URL()` so it can be absolute as well.
   *
   * Either 'script' or 'worker' must be provided.
   */
  script?: string;
  /**
   * Optional pre-instantiated worker to use instead of creating one from script.
   * This is useful when the worker script is from a remote source.
   *
   * Either 'script' or 'worker' must be provided.
   */
  worker?: Worker;
  /**
   * Whether the service stays alive after `start()` (long-running background service)
   * or exits by itself (short-lived job). Defaults to `true`.
   */
  longRunning?: boolean;
  /**
   * Restart policy applied when the worker exits unexpectedly.
   * Defaults to `no`.
   */
  restartPolicy?: RestartPolicy;
  /**
   * Cron expression for scheduling short-lived jobs.
   * When specified and `longRunning` is `false`, the service will be
   * started according to the schedule.
   */
  cron?: string;
  /**
   * Optional timeout in milliseconds for short-lived jobs.
   * If the service hasn't completed within the timeout, it will be terminated.
   */
  timeout?: number;
}
