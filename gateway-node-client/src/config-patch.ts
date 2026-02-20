import { buildGatewayClientOptions } from "./common/args.ts";
import { readOptionalNumberArg, readOptionalStringArg, readRawValueFromArgs } from "./common/io.ts";
import { GatewayConfigClient } from "./gateway-config-client.ts";

async function main() {
  const argv = process.argv.slice(2);
  const opts = buildGatewayClientOptions({ argv, defaultScopes: ["operator.admin"] });

  const raw = readRawValueFromArgs(argv);
  const baseHash = readOptionalStringArg(argv, "--base-hash");
  const sessionKey = readOptionalStringArg(argv, "--session-key");
  const note = readOptionalStringArg(argv, "--note");
  const restartDelayMs = readOptionalNumberArg(argv, "--restart-delay-ms");

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
    const resolvedBaseHash = baseHash ?? (await client.get()).hash;
    const res = await client.patch({
      raw,
      baseHash: resolvedBaseHash,
      sessionKey,
      note,
      restartDelayMs,
    });
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  } finally {
    client.stop();
  }
}

await main();
