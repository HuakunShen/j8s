import { Hono } from "hono";
import type { IServiceManager, HealthCheckResult } from "./interface";
import { describeRoute, openAPISpecs } from "hono-openapi";
import * as v from "valibot";
import { resolver, validator as vValidator } from "hono-openapi/valibot";
import { Scalar } from "@scalar/hono-api-reference";
import { createServiceManagerUI } from "./ui.tsx";
import { Effect } from "effect";

// Define validation schemas
const ServiceNameSchema = v.object(
  {
    name: v.string(),
  },
  "ServiceNameSchema"
);

const HealthDetailsSchema = v.object(
  {
    status: v.string(),
    details: v.optional(v.record(v.string(), v.any())),
  },
  "HealthDetailsSchema"
);

const ServiceResponseSchema = v.object(
  {
    name: v.string(),
    status: v.string(),
    health: HealthDetailsSchema,
  },
  "ServiceResponseSchema"
);

const ServiceListItemSchema = v.object(
  {
    name: v.string(),
  },
  "ServiceListItemSchema"
);

const ServicesListResponseSchema = v.object(
  {
    services: v.array(ServiceListItemSchema),
  },
  "ServicesListResponseSchema"
);

const ErrorResponseSchema = v.object(
  {
    error: v.string(),
  },
  "ErrorResponseSchema"
);

const MessageResponseSchema = v.object(
  {
    message: v.string(),
  },
  "MessageResponseSchema"
);

const HealthCheckResponseSchema = v.object(
  {
    status: v.string(),
    details: v.optional(v.record(v.string(), v.any())),
  },
  "HealthCheckResponseSchema"
);

// For the record type, we'll use a different approach
const AllHealthCheckResponseSchema = v.record(
  v.string(),
  v.object({
    status: v.string(),
    details: v.optional(v.record(v.string(), v.any())),
  }),
  "AllHealthCheckResponseSchema"
);

export interface APIConfig {
  openapi?: {
    enabled?: boolean;
    info?: {
      title?: string;
      version?: string;
      description?: string;
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
  };
  scalar?: {
    enabled?: boolean;
    theme?:
      | "default"
      | "deepSpace"
      | "alternate"
      | "moon"
      | "purple"
      | "solarized"
      | "bluePlanet"
      | "saturn"
      | "kepler"
      | "elysiajs"
      | "fastify"
      | "mars"
      | "laserwave"
      | "none";
  };
}

/**
 * Creates a new service manager REST API.
 * @param serviceManager - The service manager to use.
 * @param config - The configuration for the API.
 * @returns A new service manager REST API.
 */
export function createServiceManagerAPI(
  serviceManager: IServiceManager,
  config?: APIConfig
): Hono {
  const app = new Hono();

  // Mount the UI routes
  app.route("/", createServiceManagerUI(serviceManager));

  // Add OpenAPI documentation if enabled
  if (config?.openapi?.enabled) {
    app.get(
      "/openapi",
      openAPISpecs(app, {
        documentation: {
          info: {
            title: config.openapi.info?.title ?? "j8s Service Manager API",
            version: config.openapi.info?.version ?? "1.0.0",
            description:
              config.openapi.info?.description ??
              "API for managing j8s services",
          },
          servers: config.openapi.servers ?? [
            { url: "http://localhost:3000", description: "Local Server" },
          ],
        },
      })
    );
  }

  // Add Scalar API reference UI if enabled
  if (config?.scalar?.enabled) {
    app.get(
      "/scalar",
      Scalar({
        url: "/openapi",
        theme: config.scalar.theme ?? "deepSpace",
      })
    );
  }

  // List all services
  app.get(
    "/api/services",
    describeRoute({
      description: "List all registered services",
      responses: {
        200: {
          description: "List of services",
          content: {
            "application/json": {
              schema: resolver(ServicesListResponseSchema),
            },
          },
        },
      },
    }),
    (c) => {
      const services = serviceManager.services.map((service) => ({
        name: service.name,
      }));

      return c.json({
        services,
      });
    }
  );

  // Get service details
  app.get(
    "/api/services/:name",
    describeRoute({
      description: "Get details for a specific service",
      responses: {
        200: {
          description: "Service details",
          content: {
            "application/json": { schema: resolver(ServiceResponseSchema) },
          },
        },
        404: {
          description: "Service not found",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    async (c) => {
      const { name } = c.req.valid("param");
      const service = serviceManager.services.find((s) => s.name === name);

      if (!service) {
        return c.json({ error: `Service '${name}' not found` }, 404);
      }

      try {
        const health: HealthCheckResult = await Effect.runPromise(
          serviceManager.healthCheckServiceEffect(name)
        );

        return c.json({
          name: service.name,
          status: health.status,
          health,
        });
      } catch (error) {
        return c.json({ error: `Failed to get service details: ${error}` }, 500);
      }
    }
  );

  // Start a service
  app.post(
    "/api/services/:name/start",
    describeRoute({
      description: "Start a specific service",
      responses: {
        200: {
          description: "Service started successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to start service",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    async (c) => {
      const { name } = c.req.valid("param");
      try {
        await Effect.runPromise(
          serviceManager.startServiceEffect(name)
        );
        return c.json({ message: `Service '${name}' started` });
      } catch (error) {
        return c.json(
          { error: `Failed to start service '${name}': ${error}` },
          500
        );
      }
    }
  );

  // Stop a service
  app.post(
    "/api/services/:name/stop",
    describeRoute({
      description: "Stop a specific service",
      responses: {
        200: {
          description: "Service stopped successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to stop service",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    async (c) => {
      const { name } = c.req.valid("param");
      try {
        await Effect.runPromise(
          serviceManager.stopServiceEffect(name)
        );
        return c.json({ message: `Service '${name}' stopped` });
      } catch (error) {
        return c.json(
          { error: `Failed to stop service '${name}': ${error}` },
          500
        );
      }
    }
  );

  // Restart a service
  app.post(
    "/api/services/:name/restart",
    describeRoute({
      description: "Restart a specific service",
      responses: {
        200: {
          description: "Service restarted successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to restart service",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    async (c) => {
      const { name } = c.req.valid("param");
      try {
        await Effect.runPromise(serviceManager.restartServiceEffect(name));
        return c.json({ message: `Service '${name}' restarted` });
      } catch (error) {
        return c.json(
          { error: `Failed to restart service '${name}': ${error}` },
          500
        );
      }
    }
  );

  // Remove a service
  app.delete(
    "/api/services/:name",
    describeRoute({
      description: "Remove a specific service",
      responses: {
        200: {
          description: "Service removed successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to remove service",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    (c) => {
      const { name } = c.req.valid("param");
      try {
        serviceManager.removeService(name);
        return c.json({ message: `Service '${name}' removed` });
      } catch (error) {
        return c.json(
          { error: `Failed to remove service '${name}': ${error}` },
          500
        );
      }
    }
  );

  // Health check for a specific service
  app.get(
    "/api/services/:name/health",
    describeRoute({
      description: "Get health status for a specific service",
      responses: {
        200: {
          description: "Service health status",
          content: {
            "application/json": { schema: resolver(HealthCheckResponseSchema) },
          },
        },
        500: {
          description: "Failed to get health status",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    vValidator("param", ServiceNameSchema),
    async (c) => {
      const { name } = c.req.valid("param");
      try {
        const health = await Effect.runPromise(
          serviceManager.healthCheckServiceEffect(name)
        );
        return c.json(health);
      } catch (error) {
        return c.json(
          { error: `Failed to get health for service '${name}': ${error}` },
          500
        );
      }
    }
  );

  // Health check for all services
  app.get(
    "/api/health",
    describeRoute({
      description: "Get health status for all services",
      responses: {
        200: {
          description: "Health status for all services",
          content: {
            "application/json": {
              schema: resolver(AllHealthCheckResponseSchema),
            },
          },
        },
        500: {
          description: "Failed to get health status",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    async (c) => {
      try {
        const health = await Effect.runPromise(
          serviceManager.healthCheckAllServicesEffect()
        );
        return c.json(health);
      } catch (error) {
        return c.json(
          { error: `Failed to get health for services: ${error}` },
          500
        );
      }
    }
  );

  // Start all services
  app.post(
    "/api/services/start-all",
    describeRoute({
      description: "Start all registered services",
      responses: {
        200: {
          description: "All services started successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to start all services",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    async (c) => {
      try {
        await Effect.runPromise(
          serviceManager.startAllServicesEffect()
        );
        return c.json({ message: "All services started" });
      } catch (error) {
        return c.json({ error: `Failed to start all services: ${error}` }, 500);
      }
    }
  );

  // Stop all services
  app.post(
    "/api/services/stop-all",
    describeRoute({
      description: "Stop all registered services",
      responses: {
        200: {
          description: "All services stopped successfully",
          content: {
            "application/json": { schema: resolver(MessageResponseSchema) },
          },
        },
        500: {
          description: "Failed to stop all services",
          content: {
            "application/json": { schema: resolver(ErrorResponseSchema) },
          },
        },
      },
    }),
    async (c) => {
      try {
        await Effect.runPromise(
          serviceManager.stopAllServicesEffect()
        );
        return c.json({ message: "All services stopped" });
      } catch (error) {
        return c.json({ error: `Failed to stop all services: ${error}` }, 500);
      }
    }
  );

  return app;
}
