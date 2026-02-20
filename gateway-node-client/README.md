# @openclaw/gateway-node-client

Node.js WebSocket client for the OpenClaw gateway control protocol.

## Read config from a gateway

```bash
pnpm --filter @openclaw/gateway-node-client config:get -- \
  --url ws://127.0.0.1:18789 \
  --token "$OPENCLAW_GATEWAY_TOKEN" \
  --scopes operator.read
```

For `wss://` gateways with a pinned cert fingerprint:

```bash
pnpm --filter @openclaw/gateway-node-client config:get -- \
  --url wss://gateway.example.com \
  --token "$OPENCLAW_GATEWAY_TOKEN" \
  --tls-fingerprint "$OPENCLAW_GATEWAY_TLS_FINGERPRINT" \
  --scopes operator.read
```
