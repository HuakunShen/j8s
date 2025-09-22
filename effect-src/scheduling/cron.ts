import { Cron, DateTime, Duration, Effect, Schedule } from "effect"
import type { CronJobConfig } from "../services/interfaces"

/**
 * Cron utilities for Effect-based scheduling
 * Replaces the manual cron package usage
 */
export const CronScheduling = {
  /**
   * Create a cron that runs at specific times
   */
  daily: (hour: number, minute: number = 0, timeZone?: DateTime.TimeZone) =>
    Cron.make({
      seconds: [0],
      minutes: [minute],
      hours: [hour],
      days: [],
      months: [],
      weekdays: [],
      ...(timeZone && { tz: timeZone })
    }),

  /**
   * Create a cron that runs every hour
   */
  hourly: (minute: number = 0) =>
    Cron.make({
      seconds: [0],
      minutes: [minute],
      hours: [],
      days: [],
      months: [],
      weekdays: []
    }),

  /**
   * Create a cron that runs every N minutes
   */
  everyMinutes: (interval: number) => {
    const minutes = Array.from({ length: Math.floor(60 / interval) }, (_, i) => i * interval)
    return Cron.make({
      seconds: [0],
      minutes,
      hours: [],
      days: [],
      months: [],
      weekdays: []
    })
  },

  /**
   * Create a cron that runs on specific weekdays
   */
  weekly: (
    weekdays: number[], 
    hour: number = 0, 
    minute: number = 0,
    timeZone?: DateTime.TimeZone
  ) =>
    Cron.make({
      seconds: [0],
      minutes: [minute],
      hours: [hour],
      days: [],
      months: [],
      weekdays,
      ...(timeZone && { tz: timeZone })
    }),

  /**
   * Create a cron that runs monthly on specific days
   */
  monthly: (
    days: number[], 
    hour: number = 0, 
    minute: number = 0,
    timeZone?: DateTime.TimeZone
  ) =>
    Cron.make({
      seconds: [0],
      minutes: [minute],
      hours: [hour],
      days,
      months: [],
      weekdays: [],
      ...(timeZone && { tz: timeZone })
    }),

  /**
   * Parse a traditional cron expression into Effect's Cron
   * Note: This is a simplified parser for common patterns
   */
  fromExpression: (cronExpression: string, timeZone?: DateTime.TimeZone) => {
    const parts = cronExpression.trim().split(/\s+/)
    
    if (parts.length < 5) {
      throw new Error("Invalid cron expression: must have at least 5 parts")
    }

    const [minuteStr, hourStr, dayStr, monthStr, weekdayStr] = parts

    const parseField = (field: string, max: number): number[] => {
      if (field === "*") return []
      if (field.includes(",")) return field.split(",").map(Number)
      if (field.includes("/")) {
        const [range, step] = field.split("/")
        const stepNum = Number(step)
        if (range === "*") {
          return Array.from({ length: Math.floor(max / stepNum) }, (_, i) => i * stepNum)
        }
      }
      if (field.includes("-")) {
        const [start, end] = field.split("-").map(Number)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
      }
      return [Number(field)]
    }

    return Cron.make({
      seconds: [0], // Always start at 0 seconds
      minutes: parseField(minuteStr, 60),
      hours: parseField(hourStr, 24),
      days: parseField(dayStr, 31),
      months: parseField(monthStr, 12),
      weekdays: parseField(weekdayStr, 7),
      ...(timeZone && { tz: timeZone })
    })
  }
} as const

/**
 * Common cron patterns
 */
export const CronPatterns = {
  // Every minute
  everyMinute: Cron.make({
    seconds: [0],
    minutes: [],
    hours: [],
    days: [],
    months: [],
    weekdays: []
  }),

  // Every 5 minutes  
  every5Minutes: CronScheduling.everyMinutes(5),

  // Every hour at minute 0
  everyHour: CronScheduling.hourly(),

  // Daily at midnight
  daily: CronScheduling.daily(0),

  // Daily at 6 AM
  dailyAt6AM: CronScheduling.daily(6),

  // Weekly on Sunday at midnight
  weekly: CronScheduling.weekly([0]),

  // Monthly on the 1st at midnight
  monthly: CronScheduling.monthly([1]),

  // Backup schedule - 2 AM every day
  backup: CronScheduling.daily(2),

  // Health check - every 30 seconds
  healthCheck: CronScheduling.everyMinutes(30),

  // Maintenance - Sunday 3 AM
  maintenance: CronScheduling.weekly([0], 3)
} as const

/**
 * Effect for running a task on a cron schedule
 */
export const runOnSchedule = <A, E, R>(
  cron: Cron.Cron,
  task: Effect.Effect<A, E, R>,
  timeout?: Duration.Duration
): Effect.Effect<never, E, R> => {
  const scheduledTask = timeout
    ? Effect.timeout(task, timeout)
    : task

  return Effect.schedule(scheduledTask, Schedule.cron(cron))
}

/**
 * Create a cron job configuration helper
 */
export const createCronJob = (
  cron: Cron.Cron,
  timeout?: Duration.Duration
): CronJobConfig => ({
  cron,
  ...(timeout && { timeout })
})
