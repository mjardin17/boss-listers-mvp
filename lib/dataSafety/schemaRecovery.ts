import type { RepairTelemetry } from "./fallbackRepair";

export function buildSchemaRecoveryTelemetry(telemetry: RepairTelemetry) {
  const repairCount =
    telemetry.repairedFields.length + telemetry.invalidFields.length + telemetry.fallbackUsage.length;
  const payloadQualityScore = Math.max(0, Math.min(100, 100 - repairCount * 6 - telemetry.invalidFields.length * 6));
  return {
    repairedFields: telemetry.repairedFields,
    invalidFields: telemetry.invalidFields,
    fallbackUsage: telemetry.fallbackUsage,
    confidenceDegradation: 100 - payloadQualityScore,
    payloadQualityScore
  };
}
