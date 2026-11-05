import { createGatewayApp } from "./app.js";
import { ConfigError, loadGatewayConfig } from "./config.js";

function start(): void {
  let config;
  try {
    config = loadGatewayConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const { app, controller } = createGatewayApp({ config });
  controller.start();

  const server = app.listen(config.port, "127.0.0.1", () => {
    // Only non-sensitive summary is printed.
    console.log(
      `neverdown-gateway listening on :${config.port} (chainId=${config.chainId}, providers=${config.providers.length}, redundancy=${config.providers.length > 1})`,
    );
  });

  process.on("SIGINT", () => {
    controller.stop();
    server.close(() => process.exit(0));
  });
}

start();