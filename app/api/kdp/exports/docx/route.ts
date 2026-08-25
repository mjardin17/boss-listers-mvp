import { buildDocxExport } from "../../../../../lib/kdp/exports";
import { exportResponse, kdpErrorResponse, parseKdpRequest } from "../../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId, packageData, persisted } = await parseKdpRequest(request);
    const exportResult = await buildDocxExport(packageData);
    return exportResponse({ userId, packageData, persisted, exportType: "docx", exportResult });
  } catch (error) {
    return kdpErrorResponse(error);
  }
}
