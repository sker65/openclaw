import crypto from "node:crypto";
import { base64UrlEncode } from "./base64url.ts";

export type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

export type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
  email?: string;
};

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(obj), "utf8"));
}

export function createJwtHs256(payload: JwtPayload, secret: string): string {
  const header: JwtHeader = { alg: "HS256", typ: "JWT" };
  const encHeader = base64UrlEncodeJson(header);
  const encPayload = base64UrlEncodeJson(payload);
  const toSign = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest();
  return `${toSign}.${base64UrlEncode(sig)}`;
}
