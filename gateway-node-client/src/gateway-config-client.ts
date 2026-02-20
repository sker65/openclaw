import { GatewayWsClient } from "./internal/gateway-ws-client.ts";

export type GatewayConnectOptions = {
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  cookie?: string;
  proxyJwtSecret?: string;
  disableDeviceIdentity?: boolean;
  scopes: string[];
  clientVersion?: string;
  platform?: string;
};

export type ConfigSnapshot = Record<string, unknown> & {
  hash?: string;
  raw?: string;
  config?: unknown;
  valid?: boolean;
  issues?: unknown[];
};

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: Record<string, unknown>;
  version: string;
  generatedAt: string;
};

export class GatewayConfigClient {
  private client: GatewayWsClient | null = null;
  private connected = false;
  private opts: GatewayConnectOptions;

  constructor(opts: GatewayConnectOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.connected) {
      return;
    }
    if (this.client) {
      // If we have a client but aren't connected, recreate it.
      this.client.stop();
      this.client = null;
    }

    let resolveReady: (() => void) | null = null;
    let rejectReady: ((err: unknown) => void) | null = null;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    let settled = false;
    const client = new GatewayWsClient({
      url: this.opts.url,
      token: this.opts.token,
      password: this.opts.password,
      cookie: this.opts.cookie,
      proxyJwtSecret: this.opts.proxyJwtSecret,
      disableDeviceIdentity: this.opts.disableDeviceIdentity,
      clientId: "gateway-client",
      mode: "backend",
      clientVersion: this.opts.clientVersion ?? "dev",
      platform: this.opts.platform ?? "node",
      role: "operator",
      scopes: this.opts.scopes,
      onHelloOk: () => {
        if (settled) {
          return;
        }
        settled = true;
        this.connected = true;
        resolveReady?.();
      },
      onConnectError: (err) => {
        if (settled) {
          return;
        }
        settled = true;
        rejectReady?.(err);
      },
      onClose: (code, reason) => {
        this.connected = false;
        if (!settled) {
          settled = true;
          rejectReady?.(new Error(`gateway closed during connect (${code}): ${reason}`));
        }
      },
    });

    this.client = client;
    this.client.start();
    await ready;
  }

  stop(): void {
    this.client?.stop();
    this.client = null;
    this.connected = false;
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.connected) {
      await this.start();
    }
    if (!this.client) {
      throw new Error("gateway not connected");
    }
    return await this.client.request<T>(method, params);
  }

  async get(): Promise<ConfigSnapshot> {
    return await this.request<ConfigSnapshot>("config.get", {});
  }

  async schema(): Promise<ConfigSchemaResponse> {
    return await this.request<ConfigSchemaResponse>("config.schema", {});
  }

  async set(params: { raw: string; baseHash?: string }): Promise<unknown> {
    return await this.request("config.set", params);
  }

  async patch(params: {
    raw: string;
    baseHash?: string;
    sessionKey?: string;
    note?: string;
    restartDelayMs?: number;
  }): Promise<unknown> {
    return await this.request("config.patch", params);
  }

  async apply(params: {
    raw: string;
    baseHash?: string;
    sessionKey?: string;
    note?: string;
    restartDelayMs?: number;
  }): Promise<unknown> {
    return await this.request("config.apply", params);
  }
}
