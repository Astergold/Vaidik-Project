import { installJobs } from "./install.js";
import { allJobs } from "./index.js";

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL (owner role) is required to install the job queue");
  process.exit(1);
}
const queues = await installJobs(url, allJobs);
console.warn(`jobs installed. queues: ${queues.join(", ")}`);
