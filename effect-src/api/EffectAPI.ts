import { Effect, Console, Context } from "effect"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import type { IEffectServiceManager } from "../runtime/EffectServiceManager"
import type { HealthCheckResult } from "../services/interfaces"
import { EffectServiceManager } from "../runtime/EffectServiceManager"

/**
 * Effect-based API configuration
 */
export interface EffectAPIConfig {
  readonly enableOpenAPI?: boolean
  readonly enableScalar?: boolean
  readonly enableMetrics?: boolean
  readonly enableTracing?: boolean
  readonly cors?: {
    origin?: string[]
    methods?: string[]
  }
}

/**
 * API response types for Effect-based j8s API
 */
interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

interface ServicesListResponse {
  services: Array<{
    name: string
    status?: string
  }>
}

interface ServiceResponse {
  name: string
  status: string
  health: HealthCheckResult
}

/**
 * Create Effect-based REST API for j8s service management
 */
export const createEffectAPI = (
  config: EffectAPIConfig = {}
): Effect.Effect<Hono, never, IEffectServiceManager> =>
  Effect.gen(function* () {
    const manager = yield* EffectServiceManager
    const app = new Hono()

    // Middleware for CORS
    if (config.cors) {
      app.use("*", async (c, next) => {
        if (config.cors?.origin) {
          c.header("Access-Control-Allow-Origin", config.cors.origin.join(", "))
        }
        if (config.cors?.methods) {
          c.header("Access-Control-Allow-Methods", config.cors.methods.join(", "))
        }
        c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        
        if (c.req.method === "OPTIONS") {
          return new Response("", { status: 204 })
        }
        await next()
      })
    }

    // Health check endpoint
    app.get("/health", async (c) => {
      try {
        const health = await Effect.runPromise(manager.getOverallHealth)
        
        return c.json({
          success: true,
          data: health,
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    // List all services
    app.get("/services", async (c) => {
      try {
        const services = await Effect.runPromise(manager.getAllServices)
        const healthChecks = await Effect.runPromise(manager.healthCheckAllServices)
        
        const serviceList: ServicesListResponse = {
          services: services.map(service => ({
            name: service.name,
            status: healthChecks[service.name]?.status
          }))
        }
        
        return c.json({
          success: true,
          data: serviceList,
          timestamp: new Date().toISOString()
        } as ApiResponse<ServicesListResponse>)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    // Get specific service details
    app.get("/services/:name", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        // Get service first to check if it exists
        const service = await Effect.runPromise(
          Effect.gen(function* () {
            const allServices = yield* manager.getAllServices
            const foundService = allServices.find(s => s.name === serviceName)
            if (!foundService) {
              throw new Error(`Service '${serviceName}' not found`)
            }
            return foundService
          })
        )
        
        const health = await Effect.runPromise(
          manager.healthCheckService(serviceName).pipe(
            Effect.catchAll(() => Effect.succeed({
              status: "unhealthy" as const,
              details: { error: "Health check failed" },
              timestamp: new Date()
            } as HealthCheckResult))
          )
        )

        const serviceResponse: ServiceResponse = {
          name: serviceName,
          status: health.status,
          health
        }
        
        return c.json({
          success: true,
          data: serviceResponse,
          timestamp: new Date().toISOString()
        } as ApiResponse<ServiceResponse>)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Start a service
    app.post("/services/:name/start", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        await Effect.runPromise(manager.startService(serviceName))
        
        return c.json({
          success: true,
          data: { message: `Service '${serviceName}' started successfully` },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Stop a service
    app.post("/services/:name/stop", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        await Effect.runPromise(manager.stopService(serviceName))
        
        return c.json({
          success: true,
          data: { message: `Service '${serviceName}' stopped successfully` },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Restart a service
    app.post("/services/:name/restart", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        await Effect.runPromise(manager.restartService(serviceName))
        
        return c.json({
          success: true,
          data: { message: `Service '${serviceName}' restarted successfully` },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Remove a service
    app.delete("/services/:name", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        await Effect.runPromise(manager.removeService(serviceName))
        
        return c.json({
          success: true,
          data: { message: `Service '${serviceName}' removed successfully` },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Get service health
    app.get("/services/:name/health", async (c) => {
      const serviceName = c.req.param("name")
      
      try {
        const health = await Effect.runPromise(manager.healthCheckService(serviceName))
        
        return c.json({
          success: true,
          data: health,
          timestamp: new Date().toISOString()
        } as ApiResponse<HealthCheckResult>)
      } catch (error) {
        const status = String(error).includes("not found") ? 404 : 500
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, status)
      }
    })

    // Start all services
    app.post("/services/start-all", async (c) => {
      try {
        await Effect.runPromise(manager.startAllServices)
        
        return c.json({
          success: true,
          data: { message: "All services started successfully" },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    // Stop all services
    app.post("/services/stop-all", async (c) => {
      try {
        await Effect.runPromise(manager.stopAllServices)
        
        return c.json({
          success: true,
          data: { message: "All services stopped successfully" },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    // Metrics endpoint (if enabled)
    if (config.enableMetrics) {
      app.get("/metrics", async (c) => {
        try {
          const health = await Effect.runPromise(manager.getOverallHealth)
          const serviceCount = await Effect.runPromise(manager.getServiceCount)
          
          // Basic Prometheus-style metrics
          const metrics = [
            `# HELP j8s_services_total Total number of services`,
            `# TYPE j8s_services_total gauge`,
            `j8s_services_total ${serviceCount}`,
            `# HELP j8s_services_healthy Number of healthy services`,
            `# TYPE j8s_services_healthy gauge`,
            `j8s_services_healthy ${health.summary.healthy}`,
            `# HELP j8s_services_unhealthy Number of unhealthy services`,  
            `# TYPE j8s_services_unhealthy gauge`,
            `j8s_services_unhealthy ${health.summary.unhealthy}`,
            `# HELP j8s_services_crashed Number of crashed services`,
            `# TYPE j8s_services_crashed gauge`, 
            `j8s_services_crashed ${health.summary.crashed}`
          ].join("\n")
          
          return c.text(metrics)
        } catch (error) {
          return c.json({
            success: false,
            error: String(error),
            timestamp: new Date().toISOString()
          } as ApiResponse, 500)
        }
      })
    }

    // Health monitoring endpoints
    app.post("/monitoring/start", async (c) => {
      try {
        await Effect.runPromise(manager.startHealthMonitoring)
        
        return c.json({
          success: true,
          data: { message: "Health monitoring started" },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    app.post("/monitoring/stop", async (c) => {
      try {
        await Effect.runPromise(manager.stopHealthMonitoring)
        
        return c.json({
          success: true,
          data: { message: "Health monitoring stopped" },
          timestamp: new Date().toISOString()
        } as ApiResponse)
      } catch (error) {
        return c.json({
          success: false,
          error: String(error),
          timestamp: new Date().toISOString()
        } as ApiResponse, 500)
      }
    })

    yield* Console.log("Effect-based j8s API created successfully")
    return app
  })

/**
 * Run the Effect API server
 */
export const runEffectAPIServer = (
  port: number = 3000,
  config: EffectAPIConfig = {}
): Effect.Effect<void, never, IEffectServiceManager> =>
  Effect.gen(function* () {
    const app = yield* createEffectAPI(config)
    
    yield* Console.log(`Starting Effect j8s API server on port ${port}`)
    
    // In a real implementation, you'd use @hono/node-server or similar
    // This is a placeholder for the server startup
    yield* Effect.async<never, never, never>((resume) => {
      // Server would start here
      console.log(`Effect j8s API server running on http://localhost:${port}`)
      // Never resolve - keep server running
    })
  })
