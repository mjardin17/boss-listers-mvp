import { buildEpubExport } from "../../../../../lib/kdp/exports";
import { exportResponse, kdpErrorResponse, parseKdpRequest } from "../../_shared";
import { withSession } from "../../../../../lib/requireSessionApp";

export const runtime = "nodejs";

async function POST_handler(request: Request, _context: unknown, session: { userId: string }) {
  try {
    const { userId, packageData, persisted } = await parseKdpRequest(request, session.userId);
    const exportResult = await buildEpubExport(packageData);
    return exportResponse({ userId, packageData, persisted, exportType: "epub", exportResult });
  } catch (error) {
    return kdpErrorResponse(error);
  }
}

export const POST = withSession(POST_handler);
