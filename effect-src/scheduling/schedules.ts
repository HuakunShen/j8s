import { Duration, Schedule } from "effect"

/**
 * Pre-built scheduling strategies using Effect's Schedule
 */
export const Schedules = {
  /**
   * Exponential backoff starting at 10ms, max 30 seconds
   * Replaces manual exponential backoff implementation
   */
  exponentialBackoff: Schedule.exponential("10 millis").pipe(
    Schedule.compose(Schedule.upTo("30 seconds")),
    Schedule.jittered()
  ),

  /**
   * Linear backoff with 1 second intervals, max 10 retries
   */
  linearBackoff: Schedule.spaced("1 second").pipe(
    Schedule.compose(Schedule.recurs(10))
  ),

  /**
   * Fixed delay of 5 seconds between retries
   */  
  fixedDelay: Schedule.spaced("5 seconds"),

  /**
   * Fibonacci backoff sequence (1s, 1s, 2s, 3s, 5s, 8s, ...)
   */
  fibonacciBackoff: Schedule.fibonacci("1 second").pipe(
    Schedule.compose(Schedule.upTo("2 minutes"))
  ),

  /**
   * Custom exponential with configurable parameters
   */
  customExponential: (base: Duration.DurationInput, maxDelay?: Duration.DurationInput) => {
    const schedule = Schedule.exponential(base)
    return maxDelay 
      ? schedule.pipe(Schedule.compose(Schedule.upTo(maxDelay)))
      : schedule
  },

  /**
   * Retry a specific number of times with exponential backoff
   */
  retryWithLimit: (maxRetries: number, base: Duration.DurationInput = "100 millis") =>
    Schedule.exponential(base).pipe(
      Schedule.compose(Schedule.recurs(maxRetries)),
      Schedule.jittered()
    ),

  /**
   * No retry - fail immediately
   */
  never: Schedule.never,

  /**
   * Immediate retry once
   */
  once: Schedule.once,

  /**
   * Service restart policy schedules
   */
  serviceRestart: {
    always: Schedule.exponential("1 second").pipe(
      Schedule.compose(Schedule.upTo("30 seconds")),
      Schedule.jittered()
    ),

    onFailure: (maxRetries: number = 3) =>
      Schedule.exponential("1 second").pipe(
        Schedule.compose(Schedule.recurs(maxRetries)),
        Schedule.compose(Schedule.upTo("60 seconds")),
        Schedule.jittered()
      ),

    unlessStopped: Schedule.exponential("1 second").pipe(
      Schedule.compose(Schedule.upTo("10 seconds"))
    )
  }
} as const

/**
 * Schedule builder for creating custom schedules
 */
export class ScheduleBuilder {
  private schedule: Schedule.Schedule<any, any, any>

  constructor(baseSchedule: Schedule.Schedule<any, any, any> = Schedule.forever) {
    this.schedule = baseSchedule
  }

  static exponential(base: Duration.DurationInput) {
    return new ScheduleBuilder(Schedule.exponential(base))
  }

  static spaced(interval: Duration.DurationInput) {
    return new ScheduleBuilder(Schedule.spaced(interval))
  }

  static fixed(interval: Duration.DurationInput) {
    return new ScheduleBuilder(Schedule.spaced(interval))
  }

  withMaxRetries(count: number) {
    this.schedule = this.schedule.pipe(Schedule.compose(Schedule.recurs(count)))
    return this
  }

  withMaxDelay(duration: Duration.DurationInput) {
    this.schedule = this.schedule.pipe(Schedule.compose(Schedule.upTo(duration)))
    return this
  }

  withJitter() {
    this.schedule = this.schedule.pipe(Schedule.jittered())
    return this
  }

  build() {
    return this.schedule
  }
}
