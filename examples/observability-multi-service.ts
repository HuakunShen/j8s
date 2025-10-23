/**
 * Multi-Service Observability Example
 * 
 * This example demonstrates:
 * 1. Multiple BaseService (Promise-based) instances working together
 * 2. Automatic observability for all services
 * 3. Each service reporting to OTLP with its own service name
 * 4. Centralized observability configuration in ServiceManager
 * 
 * Run this example:
 *   bun run examples/observability-multi-service.ts
 * 
 * Prerequisites:
 * - OTLP endpoint running (e.g., localhost:4318)
 * - Grafana configured to show OTLP logs
 * 
 * Expected Result:
 * - Three separate services in Grafana: "user-service", "payment-service", "notification-service"
 * - Each service's logs properly attributed
 * - Both Promise-based and Effect-based services work seamlessly
 */

import { BaseService, BaseEffectService, ServiceManager } from "../index.js"
import { Effect, Layer, Runtime, Duration } from "effect"
import type { HealthCheckResult } from "../src/interface.js"

// OTLP endpoint - change this to your OTLP collector
const OTLP_BASE_URL = process.env.OTLP_BASE_URL || "http://localhost:4318"

/**
 * User Service - Pure Promise-based service (BaseService)
 * Uses async/await with no Effect dependencies
 */
class UserService extends BaseService {
	private requestCount = 0

	constructor() {
		super("user-service")
	}

	async start(): Promise<void> {
		// ServiceManager will handle start/stop logging with OTLP
		await this.sleep(500)

		for (let i = 1; i <= 3; i++) {
			// Note: These console.log won't appear in Grafana since they're inside pure Promise
			// For full observability, use BaseEffectService or add spans in ServiceManager
			console.log(`Processing user request #${i}`)
			this.requestCount++
			await this.sleep(200)
		}

		// ServiceManager handles completion logging
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	async stop(): Promise<void> {
		// ServiceManager will handle stop logging with OTLP
		await this.sleep(200)
	}

	async healthCheck(): Promise<HealthCheckResult> {
		return {
			status: "running",
			details: {
				requestCount: this.requestCount,
				serviceType: "promise-based",
				uptime: process.uptime(),
			},
		}
	}
}

/**
 * Payment Service - Pure Promise-based service (BaseService)
 * Similar to User Service but handles payments
 */
class PaymentService extends BaseService {
	private transactionCount = 0
	private totalAmount = 0

	constructor() {
		super("payment-service")
	}

	async start(): Promise<void> {
		// ServiceManager will handle start/stop logging with OTLP
		await this.sleep(500)

		const amounts = [100, 250, 50]
		for (const amount of amounts) {
			// Note: These console.log won't appear in Grafana since they're inside pure Promise
			// For full observability, use BaseEffectService or add spans in ServiceManager
			console.log(`Processing payment transaction: $${amount}`)
			this.transactionCount++
			this.totalAmount += amount
			await this.sleep(300)
		}

		// ServiceManager handles completion logging
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	async stop(): Promise<void> {
		// ServiceManager will handle stop logging with OTLP
		await this.sleep(200)
	}

	async healthCheck(): Promise<HealthCheckResult> {
		return {
			status: "running",
			details: {
				transactionCount: this.transactionCount,
				totalAmount: this.totalAmount,
				serviceType: "promise-based",
				uptime: process.uptime(),
			},
		}
	}
}

/**
 * Notification Service - Effect-based service (BaseEffectService)
 * Returns Effects directly - j8s applies observability automatically!
 */
class NotificationService extends BaseEffectService {
	readonly name = "notification-service"
	private notificationsSent = 0
	// j8s will populate this automatically - inherited from BaseEffectService

	startEffect(): Effect.Effect<void, Error> {
		const self = this
		return Effect.gen(function* () {
			yield* Effect.logInfo("📧 Starting Notification Service (Effect-based)...")
			yield* Effect.sleep(Duration.millis(500))

			// Simulate sending notifications
			const recipients = ["user1@example.com", "user2@example.com", "user3@example.com"]
			for (const recipient of recipients) {
				yield* Effect.logInfo(`Sending notification to ${recipient}`)
				self.notificationsSent++
				yield* Effect.sleep(Duration.millis(200))
			}

			yield* Effect.logInfo(`✅ Notification Service started (sent ${self.notificationsSent} notifications)`)
		}).pipe(
			Effect.withSpan("notification_service_start", {
				attributes: {
					"service.type": "notification",
					"service.implementation": "effect-based",
					"initial.notifications": 3,
				},
			})
			// NO Effect.provide() needed! j8s applies the layer automatically including Logger.pretty
		)
	}

	stopEffect(): Effect.Effect<void, Error> {
		const self = this
		return Effect.gen(function* () {
			yield* Effect.logInfo("🛑 Stopping Notification Service...")
			yield* Effect.sleep(Duration.millis(200))
			yield* Effect.logInfo(
				`✅ Notification Service stopped (total notifications sent: ${self.notificationsSent})`
			)
		}).pipe(
			Effect.withSpan("notification_service_stop")
		)
	}

	healthCheckEffect(): Effect.Effect<HealthCheckResult, Error> {
		return Effect.succeed({
			status: "running" as const,
			details: {
				notificationsSent: this.notificationsSent,
				serviceType: "effect-based",
				uptime: process.uptime(),
			},
		})
	}
}

/**
 * Main function - Demonstrates mixed service types with automatic observability
 */
async function main() {
	console.log("=".repeat(70))
	console.log("j8s Multi-Service Observability Example")
	console.log("Three Services with Automatic Observability")
	console.log("=".repeat(70))
	console.log(`OTLP Endpoint: ${OTLP_BASE_URL}`)
	console.log(`Process ID: ${process.pid}`)
	console.log("=".repeat(70))
	console.log()

	const program = Effect.gen(function* () {
		// Configure observability ONCE for all services
		const serviceManager = new ServiceManager({
			observability: {
				enabled: true,
				otlpBaseUrl: OTLP_BASE_URL,
				serviceNamespace: "j8s-examples",
				serviceVersion: "1.0.0",
				defaultAttributes: {
					"team": "platform",
					"example": "multi-service",
				},
			},
		})

		// Create services - mixed Promise-based and Effect-based
		const userService = new UserService()
		const paymentService = new PaymentService()
		const notificationService = new NotificationService()

		console.log("📦 Adding services to manager...")
		console.log("   • user-service (Promise-based, handles user operations)")
		console.log("   • payment-service (Promise-based, handles payments)")
		console.log("   • notification-service (Effect-based, handles notifications)")
		console.log("   ℹ️  j8s will automatically wrap all services with OTLP layers\n")

		serviceManager.addService(userService, {
			restartPolicy: "always",
			maxRetries: 3,
		})
		serviceManager.addService(paymentService, {
			restartPolicy: "always",
			maxRetries: 3,
		})
		serviceManager.addService(notificationService, {
			restartPolicy: "always",
			maxRetries: 3,
		})
		console.log("✅ All services added (OTLP layers will be applied automatically)\n")

		// Start all services
		console.log("🚀 Starting all services...\n")
		yield* serviceManager.startServiceEffect("user-service")
		yield* serviceManager.startServiceEffect("payment-service")
		yield* serviceManager.startServiceEffect("notification-service")
		console.log("\n✅ All services started\n")

		// Wait for a bit
		console.log("⏳ Services running for 2 seconds...\n")
		yield* Effect.sleep(Duration.seconds(2))

		// Health check all services
		console.log("🏥 Running health checks...")
		const healthResults = yield* serviceManager.healthCheckAllServicesEffect()
		for (const [serviceName, health] of Object.entries(healthResults)) {
			console.log(`  ${serviceName}: ${health.status}`, health.details)
		}
		console.log()

		// Stop all services
		console.log("🛑 Stopping all services...\n")
		yield* serviceManager.stopServiceEffect("user-service")
		yield* serviceManager.stopServiceEffect("payment-service")
		yield* serviceManager.stopServiceEffect("notification-service")
		console.log("\n✅ All services stopped\n")

		console.log("=".repeat(70))
		console.log("✨ Example completed successfully!")
		console.log("=".repeat(70))
		console.log()
		console.log("📊 Check your Grafana dashboard for:")
		console.log("   - Service: user-service (namespace: j8s-examples)")
		console.log("   - Service: payment-service (namespace: j8s-examples)")
		console.log("   - Service: notification-service (namespace: j8s-examples)")
		console.log()
		console.log("Key Benefits:")
		console.log("  ✅ No manual Otlp.layer creation - j8s does it")
		console.log("  ✅ Centralized configuration in ServiceManager")
		console.log("  ✅ Each service gets unique name in Grafana")
		console.log("  ✅ Shared namespace and attributes across services")
		console.log()
		console.log("Service Types:")
		console.log("  🔧 Promise-based (BaseService):")
		console.log("     • Pure Promise/async-await - no Effect code needed")
		console.log("     • j8s automatically wraps with OTLP layer")
		console.log("     • Good for existing async/await code")
		console.log()
		console.log("  ⚡ Effect-based (BaseEffectService):")
		console.log("     • NO Effect.provide() needed!")
		console.log("     • j8s applies observability automatically")
		console.log("     • Cleaner pattern, recommended for new services")
		console.log()
		console.log("  🎯 Both types work seamlessly together!")
	})

	await Effect.runPromise(program)
}

// Run the example
if (import.meta.main) {
	main().catch((error) => {
		console.error("❌ Error running example:", error)
		process.exit(1)
	})
}
