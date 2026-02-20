import { buildGatewayClientOptions } from "./common/args.ts";
import { GatewayConfigClient } from "./gateway-config-client.ts";

async function main() {
  const argv = process.argv.slice(2);
  const opts = buildGatewayClientOptions({ argv, defaultScopes: ["operator.admin"] });
  const client = new GatewayConfigClient({
    url: opts.url,
    token: opts.token,
    password: opts.password,
    tlsFingerprint: opts.tlsFingerprint,
    cookie: opts.cookie,
    proxyJwtSecret: opts.proxyJwtSecret,
    disableDeviceIdentity: opts.disableDeviceIdentity,
    scopes: opts.scopes,
    clientVersion: opts.clientVersion,
    platform: opts.platform,
  });

  try {
    const snapshot = await client.get();
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } finally {
    client.stop();
  }
}

await main();
