export type GatewayCommonClientOptions = {
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  cookie?: string;
  proxyJwtSecret?: string;
  disableDeviceIdentity?: boolean;
  role: "operator";
  scopes: string[];
  platform: string;
  clientVersion: string;
};

type CommonArgs = {
  url?: string;
  token?: string;
  password?: string;
  scopes?: string;
  tlsFingerprint?: string;
  cookie?: string;
};

export function parseCommonArgs(argv: string[]): CommonArgs {
  const out: CommonArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) {
      continue;
    }
    if (a === "--url") {
      out.url = argv[++i];
    } else if (a === "--token") {
      out.token = argv[++i];
    } else if (a === "--password") {
      out.password = argv[++i];
    } else if (a === "--scopes") {
      out.scopes = argv[++i];
    } else if (a === "--tls-fingerprint") {
      out.tlsFingerprint = argv[++i];
    } else if (a === "--cookie") {
      out.cookie = argv[++i];
    }
  }
  return out;
}

export function requireString(value: string | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function parseScopes(scopesRaw: string | undefined, fallback: string[]): string[] {
  if (!scopesRaw) {
    return fallback;
  }
  const scopes = scopesRaw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  return scopes.length ? scopes : fallback;
}

export function buildGatewayClientOptions(params: {
  argv: string[];
  defaultScopes: string[];
}): GatewayCommonClientOptions {
  const args = parseCommonArgs(params.argv);
  const url = requireString(
    args.url ?? process.env.OPENCLAW_GATEWAY_URL,
    "--url / OPENCLAW_GATEWAY_URL",
  );

  const token = args.token ?? process.env.OPENCLAW_GATEWAY_TOKEN;
  const password = args.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
  const tlsFingerprint = args.tlsFingerprint ?? process.env.OPENCLAW_GATEWAY_TLS_FINGERPRINT;
  const cookie = args.cookie ?? process.env.OPENCLAW_GATEWAY_COOKIE;
  const proxyJwtSecret = process.env.OCTOCLAW_SESSION_JWT_SECRET;
  const disableDeviceIdentity =
    process.env.OPENCLAW_GATEWAY_DISABLE_DEVICE_IDENTITY === "1" ||
    process.env.OPENCLAW_GATEWAY_DISABLE_DEVICE_IDENTITY?.toLowerCase() === "true";

  const scopesRaw = args.scopes ?? process.env.OPENCLAW_GATEWAY_SCOPES;
  const scopes = parseScopes(scopesRaw, params.defaultScopes);

  return {
    url,
    token,
    password,
    tlsFingerprint,
    cookie,
    proxyJwtSecret,
    disableDeviceIdentity,
    role: "operator",
    scopes,
    platform: "node",
    clientVersion: "dev",
  };
}
