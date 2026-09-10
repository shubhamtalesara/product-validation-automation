import { createLogger } from "./lib/logger.js";
import { startScheduler } from "./scheduler/index.js";

const logger = createLogger("worker");

logger.info("Starting product-validation-automation worker process");
startScheduler();
logger.info("Scheduler started, worker is now running");

process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down");
  process.exit(0);
});
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down");
  process.exit(0);
});
