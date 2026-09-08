import { normalizeCurrency } from "./normalizeCurrency";
import { normalizeNumber } from "./normalizeNumber";
import { normalizePercentage } from "./normalizePercentage";
import { isPlainObject } from "./validationGuards";

export interface RepairTelemetry {
  repairedFields: string[];
  invalidFields: string[];
  fallbackUsage: string[];
}

function repairOptionalCurrency(target: Record<string, any>, key: string, path: string, telemetry: RepairTelemetry) {
  if (!(key in target)) return;
  const original = target[key];
  if (original == null || original === "") {
    delete target[key];
    telemetry.fallbackUsage.push(path);
    return;
  }
  const normalized = normalizeCurrency(original, null);
  if (normalized == null) {
    delete target[key];
    telemetry.invalidFields.push(path);
    return;
  }
  if (normalized !== original) telemetry.repairedFields.push(path);
  target[key] = normalized;
}

function repairOptionalNumber(target: Record<string, any>, key: string, path: string, telemetry: RepairTelemetry) {
  if (!(key in target)) return;
  const original = target[key];
  if (original == null || original === "") {
    delete target[key];
    telemetry.fallbackUsage.push(path);
    return;
  }
  const normalized = normalizeNumber(original, { fallback: null });
  if (normalized == null) {
    delete target[key];
    telemetry.invalidFields.push(path);
    return;
  }
  if (normalized !== original) telemetry.repairedFields.push(path);
  target[key] = normalized;
}

function repairOptionalPercentage(target: Record<string, any>, key: string, path: string, telemetry: RepairTelemetry) {
  if (!(key in target)) return;
  const original = target[key];
  if (original == null || original === "") {
    delete target[key];
    telemetry.fallbackUsage.push(path);
    return;
  }
  const normalized = normalizePercentage(original, null);
  if (normalized == null) {
    delete target[key];
    telemetry.invalidFields.push(path);
    return;
  }
  if (normalized !== original) telemetry.repairedFields.push(path);
  target[key] = normalized;
}

export function repairFallbackPayload<T extends Record<string, any>>(payload: T, telemetry: RepairTelemetry): T {
  if (!isPlainObject(payload)) return payload;

  if (isPlainObject(payload.priceRange)) {
    repairOptionalCurrency(payload.priceRange, "low", "priceRange.low", telemetry);
    repairOptionalCurrency(payload.priceRange, "suggested", "priceRange.suggested", telemetry);
    repairOptionalCurrency(payload.priceRange, "high", "priceRange.high", telemetry);
  }

  repairOptionalNumber(payload, "estimatedTimeToSaleDays", "estimatedTimeToSaleDays", telemetry);
  repairOptionalNumber(payload, "activeListingCount", "activeListingCount", telemetry);
  repairOptionalNumber(payload, "soldCount", "soldCount", telemetry);
  repairOptionalPercentage(payload, "sellThroughRatio", "sellThroughRatio", telemetry);
  repairOptionalPercentage(payload, "roiPercentage", "roiPercentage", telemetry);
  repairOptionalCurrency(payload, "estimatedResalePrice", "estimatedResalePrice", telemetry);
  repairOptionalCurrency(payload, "estimatedProfit", "estimatedProfit", telemetry);
  repairOptionalCurrency(payload, "breakEven", "breakEven", telemetry);

  return payload;
}
