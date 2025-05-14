/**
 * This module provides functionality to create and manage a service manager API.
 * It exports a function to create a service manager instance that can be used
 * to control and monitor services via REST endpoints.
 *
 * @example
 * ```ts
 * import { serve } from "@hono/node-server";
 * import { ServiceManager, createServiceManagerAPI } from "j8s";
 *
 * // Create and configure your service manager
 * const manager = new ServiceManager();
 *
 * // Create the REST API with OpenAPI documentation
 * const app = createServiceManagerAPI(manager, {
 *   openapi: {
 *     enabled: true,
 *     info: {
 *       title: "j8s Service Manager API",
 *       version: "1.0.0",
 *       description: "API for managing j8s services",
 *     },
 *     servers: [{ url: "http://localhost:3000", description: "Local Server" }],
 *   },
 *   scalar: {
 *     enabled: true,
 *     theme: "deepSpace",
 *   },
 * });
 *
 * // Start the HTTP server
 * serve({
 *   fetch: app.fetch,
 *   port: 3000,
 * });
 * ```
 *
 * The API provides the following endpoints:
 * - GET /services - List all services
 * - GET /services/:name - Get service details
 * - GET /services/:name/health - Get health for a specific service
 * - POST /services/:name/start - Start a service
 * - POST /services/:name/stop - Stop a service
 * - POST /services/:name/restart - Restart a service
 * - DELETE /services/:name - Remove a service
 * - GET /health - Get health for all services
 * - POST /services/start-all - Start all services
 * - POST /services/stop-all - Stop all services
 *
 * @module
 */

export { createServiceManagerAPI } from "./src/api";
