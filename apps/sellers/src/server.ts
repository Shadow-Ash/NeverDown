import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";

function start(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`configuration error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const app = createApp({ config });
  app.listen(config.port, () => {
    console.log(
      `neverdown-rpc-seller listening on :${config.port} (network=${config.network}, rpcMode=${config.rpcMode})`,
    );
  });
}

start();
