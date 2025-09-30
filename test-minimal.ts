import { ServiceManager, BaseService, type HealthCheckResult } from "./index";

class MinimalService extends BaseService {
  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`MinimalService ${this.name} started`);
  }

  async stop(): Promise<void> {
    console.log(`MinimalService ${this.name} stopped`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: { message: "All good" },
    };
  }
}

async function testMinimal() {
  const manager = new ServiceManager();
  const service = new MinimalService("minimal-test");

  manager.addService(service, { restartPolicy: "no" });

  console.log("Starting minimal service...");
  await manager.startService("minimal-test");

  console.log("Service started successfully");

  // Give it time to settle
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const health = await manager.healthCheckService("minimal-test");
  console.log("Health check:", health);

  await manager.stopService("minimal-test");
  console.log("Service stopped");
}

testMinimal().catch(console.error);
