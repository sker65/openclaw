import { buildGatewayClientOptions } from "./common/args.ts";
import { GatewayConfigClient } from "./gateway-config-client.ts";

async function main() {
  const opts = buildGatewayClientOptions({
    argv: process.argv.slice(2),
    defaultScopes: ["operator.admin"],
  });
  const client = new GatewayConfigClient({
    url: opts.url,
    token: opts.token,
    password: opts.password,
    tlsFingerprint: opts.tlsFingerprint,
    cookie: opts.cookie,
    proxyJwtSecret: opts.proxyJwtSecret,
    scopes: opts.scopes,
    clientVersion: opts.clientVersion,
    platform: opts.platform,
  });

  try {
    const schema = await client.schema();
    process.stdout.write(`${JSON.stringify(schema, null, 2)}\n`);
  } finally {
    client.stop();
  }
}

await main();
