import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (they read the session), so no incremental cache is needed.
export default defineCloudflareConfig({});
