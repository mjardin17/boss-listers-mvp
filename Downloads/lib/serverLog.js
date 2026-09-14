import { randomUUID } from "crypto";

export function createRequestId() {
  return randomUUID();
}

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name || "Error",
    message: error.message || String(error)
  };
}

export function logInfo(event, details = {}) {
  console.info(
    JSON.stringify({
      level: "info",
      event,
      timestamp: new Date().toISOString(),
      ...details
    })
  );
}

export function logWarn(event, details = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      event,
      timestamp: new Date().toISOString(),
      ...details
    })
  );
}

export function logError(event, details = {}) {
  const { error, ...rest } = details;
  console.error(
    JSON.stringify({
      level: "error",
      event,
      timestamp: new Date().toISOString(),
      error: serializeError(error),
      ...rest
    })
  );
}
