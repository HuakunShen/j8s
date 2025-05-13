import { ServiceManager } from "..";
import path from "path";

async function main() {
  const manager = new ServiceManager();

  // Register a cron service that runs every 5 minutes
  manager.register({
    name: "cronService",
    script: path.resolve(__dirname, "./cronService.ts"),
    longRunning: false, // Set to false for cron jobs
    cron: "* * * * *", // Runs every 5 minutes
    timeout: 60000, // 1 minute timeout
  });

  await manager.startAll();
  console.log("Cron service manager started");

  // Keep the process running
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await manager.stopAll();
    process.exit(0);
  });
}

main().catch(console.error);
