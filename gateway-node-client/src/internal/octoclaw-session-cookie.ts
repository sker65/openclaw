import { createJwtHs256, type JwtPayload } from "./jwt-hs256.ts";

export const OCTOCLAW_SESSION_COOKIE_NAME = "octoclaw_session";

export function deriveUserIdFromProxyHostname(hostname: string): string | null {
  // Expected: <userId>.proxy.octoclaw.ai
  const suffix = ".proxy.octoclaw.ai";
  if (!hostname.endsWith(suffix)) {
    return null;
  }
  const prefix = hostname.slice(0, -suffix.length);
  if (!prefix) {
    return null;
  }
  if (prefix.includes(".")) {
    return null;
  }
  // Support numeric IDs and UUIDs.
  if (!/^[0-9a-f-]+$/i.test(prefix)) {
    return null;
  }
  return prefix;
}

export function maybeBuildOctoclawSessionCookie(params: {
  url: string;
  jwtSecret?: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): string | null {
  const jwtSecret = params.jwtSecret;
  if (!jwtSecret) {
    return null;
  }

  let hostname: string;
  try {
    hostname = new URL(params.url).hostname;
  } catch {
    return null;
  }

  const userId = deriveUserIdFromProxyHostname(hostname);
  if (!userId) {
    return null;
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = params.maxAgeSeconds ?? 60 * 60 * 24;
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
    exp: now + maxAgeSeconds,
  };

  const jwt = createJwtHs256(payload, jwtSecret);
  return `${OCTOCLAW_SESSION_COOKIE_NAME}=${jwt}`;
}
