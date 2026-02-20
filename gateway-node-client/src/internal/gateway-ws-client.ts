import { randomUUID } from "node:crypto";
import { WebSocket, type ClientOptions } from "ws";
import { buildDeviceAuthPayload } from "./device-auth.ts";
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
  type DeviceIdentity,
} from "./device-identity.ts";
import { maybeBuildOctoclawSessionCookie } from "./octoclaw-session-cookie.ts";

export type GatewayClientMode = "backend" | "cli" | "ui" | "probe" | "test" | "node" | "webchat";

export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: GatewayClientMode;
    instanceId?: string;
  };
  caps?: string[];
  role?: string;
  scopes?: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
  auth?: {
    token?: string;
    password?: string;
  };
  userAgent?: string;
  locale?: string;
};

export type RequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type ResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayWsClientOptions = {
  url: string;
  token?: string;
  password?: string;
  cookie?: string;
  proxyJwtSecret?: string;
  disableDeviceIdentity?: boolean;
  instanceId?: string;
  clientId?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  role?: string;
  scopes?: string[];
  caps?: string[];
  deviceIdentity?: DeviceIdentity | null;
  minProtocol?: number;
  maxProtocol?: number;
  onEvent?: (evt: EventFrame) => void;
  onHelloOk?: (payload: unknown) => void;
  onConnectError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
};

function rawDataToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer).toString("utf8");
  }
  if (data == null) {
    return "";
  }
  if (typeof data === "number" || typeof data === "boolean" || typeof data === "bigint") {
    return String(data);
  }
  if (data instanceof Error) {
    return data.message || data.name;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return "[unstringifiable]";
  }
}

function isDebugEnabled(): boolean {
  const v = process.env.OPENCLAW_GATEWAY_DEBUG;
  if (!v) {
    return false;
  }
  return v === "1" || v.toLowerCase() === "true";
}

export class GatewayWsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: NodeJS.Timeout | null = null;

  constructor(private opts: GatewayWsClientOptions) {
    const deviceIdentity =
      opts.disableDeviceIdentity === true
        ? null
        : opts.deviceIdentity === undefined
          ? loadOrCreateDeviceIdentity()
          : opts.deviceIdentity;
    this.opts = {
      ...opts,
      deviceIdentity,
    };
  }

  start() {
    if (this.closed) {
      return;
    }

    // Note: ws does not follow HTTP redirects; the caller must provide a final ws:// or wss:// URL.

    const derivedCookie =
      this.opts.cookie ??
      maybeBuildOctoclawSessionCookie({
        url: this.opts.url,
        jwtSecret: this.opts.proxyJwtSecret ?? process.env.OCTOCLAW_SESSION_JWT_SECRET,
      });

    if (isDebugEnabled()) {
      const cookieSource = this.opts.cookie ? "manual" : derivedCookie ? "auto" : "none";
      const cookieHasSession = derivedCookie?.includes("octoclaw_session=") ? "yes" : "no";
      const deviceIdentity = this.opts.deviceIdentity ? "yes" : "no";
      process.stderr.write(
        `[gateway-node-client] ws connect url=${this.opts.url} cookieSource=${cookieSource} hasOctoclawSession=${cookieHasSession} deviceIdentity=${deviceIdentity}\n`,
      );
    }

    const wsOptions: ClientOptions = {
      maxPayload: 25 * 1024 * 1024,
      headers: derivedCookie ? { Cookie: derivedCookie } : undefined,
    };

    this.ws = new WebSocket(this.opts.url, wsOptions);

    this.ws.on("open", () => {
      this.queueConnect();
    });

    this.ws.on("message", (data) => {
      this.handleMessage(rawDataToString(data));
    });

    this.ws.on("close", (code, reason) => {
      const reasonText = rawDataToString(reason);
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${code}): ${reasonText}`));
      this.opts.onClose?.(code, reasonText);
    });

    this.ws.on("error", (err) => {
      if (!this.connectSent) {
        this.opts.onConnectError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  stop() {
    this.closed = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => {
      this.sendConnect();
    }, 750);
  }

  private sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const role = this.opts.role ?? "operator";
    const scopes = this.opts.scopes ?? ["operator.read"];
    const caps = this.opts.caps ?? [];

    const authToken = this.opts.token;
    const auth =
      authToken || this.opts.password
        ? { token: authToken, password: this.opts.password }
        : undefined;

    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? undefined;

    const device = (() => {
      if (!this.opts.deviceIdentity) {
        return undefined;
      }
      const payload = buildDeviceAuthPayload({
        deviceId: this.opts.deviceIdentity.deviceId,
        clientId: this.opts.clientId ?? "gateway-client",
        clientMode: this.opts.mode ?? "backend",
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = signDevicePayload(this.opts.deviceIdentity.privateKeyPem, payload);
      return {
        id: this.opts.deviceIdentity.deviceId,
        publicKey: publicKeyRawBase64UrlFromPem(this.opts.deviceIdentity.publicKeyPem),
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    })();

    const params: ConnectParams = {
      minProtocol: this.opts.minProtocol ?? 3,
      maxProtocol: this.opts.maxProtocol ?? 3,
      client: {
        id: this.opts.clientId ?? "gateway-client",
        displayName: this.opts.clientDisplayName,
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? process.platform,
        mode: this.opts.mode ?? "backend",
        instanceId: this.opts.instanceId,
      },
      caps,
      role,
      scopes,
      device,
      auth,
    };

    void this.request("connect", params)
      .then((helloOk) => {
        this.opts.onHelloOk?.(helloOk);
      })
      .catch((err) => {
        this.opts.onConnectError?.(err instanceof Error ? err : new Error(String(err)));
        this.ws?.close(1008, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as EventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          this.sendConnect();
        }
        return;
      }
      this.opts.onEvent?.(evt);
      return;
    }

    if (frame.type === "res") {
      const res = parsed as ResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = randomUUID();
    const frame: RequestFrame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }
}
