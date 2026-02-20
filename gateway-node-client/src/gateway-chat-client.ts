import { randomUUID } from "node:crypto";
import { GatewayWsClient, type EventFrame } from "./internal/gateway-ws-client.ts";

export type GatewayChatConnectOptions = {
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  cookie?: string;
  proxyJwtSecret?: string;
  disableDeviceIdentity?: boolean;
  scopes: string[];
  caps?: string[];
  clientVersion?: string;
  platform?: string;
  onEvent?: (evt: EventFrame) => void;
};

export type ChatHistoryResponse = {
  sessionKey: string;
  sessionId?: string;
  messages: unknown[];
  thinkingLevel?: unknown;
  verboseLevel?: unknown;
};

export type ChatSendResponse = {
  runId: string;
  status: string;
};

export type ChatAbortResponse = {
  ok: boolean;
  aborted: boolean;
  runIds: string[];
};

export type ChatInjectResponse = {
  ok: boolean;
  messageId?: string;
};

export type AgentResponse = unknown;

export const GATEWAY_CLIENT_CAPS = {
  TOOL_EVENTS: "tool-events",
} as const;

export class GatewayChatClient {
  private client: GatewayWsClient | null = null;
  private connected = false;

  constructor(private opts: GatewayChatConnectOptions) {}

  async start(): Promise<void> {
    if (this.connected) {
      return;
    }
    if (this.client) {
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
      caps: this.opts.caps,
      onEvent: this.opts.onEvent,
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
    client.start();
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

  async history(params: { sessionKey: string; limit?: number }): Promise<ChatHistoryResponse> {
    return await this.request<ChatHistoryResponse>("chat.history", params);
  }

  async send(params: {
    sessionKey: string;
    message: string;
    thinking?: string;
    deliver?: boolean;
    attachments?: Array<{
      type?: string;
      mimeType?: string;
      fileName?: string;
      content?: unknown;
    }>;
    timeoutMs?: number;
    idempotencyKey?: string;
  }): Promise<ChatSendResponse> {
    const idempotencyKey = params.idempotencyKey ?? randomUUID();
    return await this.request<ChatSendResponse>("chat.send", { ...params, idempotencyKey });
  }

  async abort(params: { sessionKey: string; runId?: string }): Promise<ChatAbortResponse> {
    return await this.request<ChatAbortResponse>("chat.abort", params);
  }

  async inject(params: {
    sessionKey: string;
    message: string;
    label?: string;
  }): Promise<ChatInjectResponse> {
    return await this.request<ChatInjectResponse>("chat.inject", params);
  }

  async agent(params: {
    message: string;
    agentId?: string;
    to?: string;
    replyTo?: string;
    sessionId?: string;
    sessionKey?: string;
    thinking?: string;
    deliver?: boolean;
    attachments?: Array<{
      type?: string;
      mimeType?: string;
      fileName?: string;
      content?: unknown;
    }>;
    channel?: string;
    replyChannel?: string;
    accountId?: string;
    replyAccountId?: string;
    threadId?: string;
    groupId?: string;
    groupChannel?: string;
    groupSpace?: string;
    lane?: string;
    extraSystemPrompt?: string;
    timeout?: number;
    label?: string;
    spawnedBy?: string;
    inputProvenance?: unknown;
    idempotencyKey?: string;
  }): Promise<AgentResponse> {
    const idempotencyKey = params.idempotencyKey ?? randomUUID();
    return await this.request("agent", { ...params, idempotencyKey });
  }
}
