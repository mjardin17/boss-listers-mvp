export type WebsocketBusState = "DISABLED" | "CONNECTING" | "CONNECTED" | "FAILED";

export function getWebsocketStrategy() {
  return {
    state: "DISABLED" as WebsocketBusState,
    transport: "browser-event-bus",
    reason: "Next.js runtime uses local UI event streams until a dedicated websocket server is attached.",
    upgradePath: ["SSE route", "dedicated websocket service", "cross-device sync"]
  };
}
