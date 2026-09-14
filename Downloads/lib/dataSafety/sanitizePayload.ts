import { repairConfidenceScore } from "./confidenceRepair";
import { repairFallbackPayload, type RepairTelemetry } from "./fallbackRepair";
import { buildSchemaRecoveryTelemetry } from "./schemaRecovery";
import { isPlainObject } from "./validationGuards";

export function sanitizePayload<T>(payload: T): T {
  if (!isPlainObject(payload)) return payload;

  const copy = structuredClone(payload) as Record<string, any>;
  const repairTelemetry: RepairTelemetry = {
    repairedFields: [],
    invalidFields: [],
    fallbackUsage: []
  };

  repairFallbackPayload(copy, repairTelemetry);
  const dataSafetyTelemetry = buildSchemaRecoveryTelemetry(repairTelemetry);

  if ("confidenceScore" in copy) {
    const repaired = repairConfidenceScore(copy.confidenceScore, {
      payloadQualityScore: dataSafetyTelemetry.payloadQualityScore,
      fallback: 0
    });
    if (repaired !== copy.confidenceScore) {
      repairTelemetry.repairedFields.push("confidenceScore");
      copy.confidenceScore = repaired;
    }
  }

  copy.dataSafetyTelemetry = dataSafetyTelemetry;
  return copy as T;
}
