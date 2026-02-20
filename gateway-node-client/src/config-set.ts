import { buildGatewayClientOptions } from "./common/args.ts";
import { readOptionalStringArg, readRawValueFromArgs } from "./common/io.ts";
import { GatewayConfigClient } from "./gateway-config-client.ts";

async function main() {
  const argv = process.argv.slice(2);
  const opts = buildGatewayClientOptions({ argv, defaultScopes: ["operator.admin"] });

  const raw = readRawValueFromArgs(argv);
  const baseHash = readOptionalStringArg(argv, "--base-hash");
  const fetchBaseHash = !baseHash;

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
    const resolvedBaseHash = fetchBaseHash ? (await client.get()).hash : baseHash;
    const res = await client.set({ raw, baseHash: resolvedBaseHash });
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } finally {
    client.stop();
  }
}

await main();
