import { config } from "dotenv";
import { resolve } from "node:path";

// Local runs read the repo-root .env. In CI the variables are already set and win.
config({ path: resolve(__dirname, "../../../.env") });
