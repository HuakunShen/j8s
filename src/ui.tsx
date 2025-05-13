import { Hono } from "hono";
import type { FC } from "hono/jsx";
import type { IServiceManager } from "./interface";

const ui = new Hono();

// Layout component with basic styling
const Layout: FC = (props) => {
  return (
    <html>
      <head>
        <title>j8s Service Manager</title>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <style>
          {`
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 1200px;
              margin: 0 auto;
              padding: 2rem;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 2rem;
            }
            .service-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 1rem;
            }
            .service-card {
              background: white;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 1rem;
              transition: all 0.2s;
            }
            .service-card:hover {
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            .service-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
            }
            .service-name {
              font-weight: bold;
              font-size: 1.2rem;
            }
            .service-status {
              padding: 0.25rem 0.5rem;
              border-radius: 4px;
              font-size: 0.875rem;
            }
            .status-healthy {
              background: #e6f4ea;
              color: #1e7e34;
            }
            .status-unhealthy {
              background: #fce8e6;
              color: #c5221f;
            }
            .status-unknown {
              background: #f1f3f4;
              color: #5f6368;
            }
            .button-group {
              display: flex;
              gap: 0.5rem;
            }
            button {
              padding: 0.5rem 1rem;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.875rem;
              transition: all 0.2s;
            }
            button:hover {
              opacity: 0.9;
            }
            .btn-primary {
              background: #1a73e8;
              color: white;
            }
            .btn-danger {
              background: #dc3545;
              color: white;
            }
            .btn-secondary {
              background: #6c757d;
              color: white;
            }
            .global-actions {
              margin-bottom: 2rem;
              display: flex;
              gap: 1rem;
            }
          `}
        </style>
      </head>
      <body>
        <div class="container">{props.children}</div>
      </body>
    </html>
  );
};

// Service card component
const ServiceCard: FC<{
  name: string;
  status: string;
  health: { status: string; details?: Record<string, any> };
}> = (props) => {
  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return "status-healthy";
      case "unhealthy":
        return "status-unhealthy";
      default:
        return "status-unknown";
    }
  };

  return (
    <div class="service-card">
      <div class="service-header">
        <span class="service-name">{props.name}</span>
        <span class={`service-status ${getStatusClass(props.health.status)}`}>
          {props.health.status}
        </span>
      </div>
      <div class="button-group">
        <button
          class="btn-primary"
          hx-post={`/api/services/${props.name}/start`}
          hx-swap="none"
        >
          Start
        </button>
        <button
          class="btn-danger"
          hx-post={`/api/services/${props.name}/stop`}
          hx-swap="none"
        >
          Stop
        </button>
        <button
          class="btn-secondary"
          hx-post={`/api/services/${props.name}/restart`}
          hx-swap="none"
        >
          Restart
        </button>
      </div>
    </div>
  );
};

// Main page component
const Dashboard: FC<{ services: any[] }> = (props) => {
  return (
    <Layout>
      <div class="header">
        <h1>j8s Service Manager</h1>
      </div>

      <div class="global-actions">
        <button
          class="btn-primary"
          hx-post="/api/services/start-all"
          hx-swap="none"
        >
          Start All Services
        </button>
        <button
          class="btn-danger"
          hx-post="/api/services/stop-all"
          hx-swap="none"
        >
          Stop All Services
        </button>
      </div>

      <div class="service-grid">
        {props.services.map((service) => (
          <ServiceCard
            name={service.name}
            status={service.status}
            health={service.health}
          />
        ))}
      </div>
    </Layout>
  );
};

// Create UI routes
export function createServiceManagerUI(serviceManager: IServiceManager): Hono {
  ui.get("/", async (c) => {
    const services = await Promise.all(
      serviceManager.services.map(async (service) => {
        const health = await serviceManager.healthCheckService(service.name);
        return {
          name: service.name,
          status: health.status,
          health,
        };
      })
    );

    return c.html(<Dashboard services={services} />);
  });

  return ui;
}
