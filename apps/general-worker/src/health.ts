import { createServer, type Server } from "node:http";
import type { Logger } from "@signalguard/config";

/**
 * Minimal HTTP health endpoint so the cloud worker host can verify the process
 * is alive (auto-restart on failure). Responds 200 on /health, 404 otherwise.
 */
export function startHealthServer(opts: {
  port: number;
  service: string;
  logger: Logger;
}): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", service: opts.service }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  server.listen(opts.port, () => {
    opts.logger.info({ port: opts.port }, "health server listening");
  });
  return server;
}
