import {
  getVideoProject,
  saveVideoProject
} from "./projectStore";

export async function transitionRender(
  projectId: string,

  status:
    | "READY"
    | "QUEUED"
    | "RENDERING"
    | "SUCCEEDED"
    | "FAILED",

  patch: {
    progress?: number;
    error?: string;
    outputUrl?: string;
  } = {}
) {
  const project =
    await getVideoProject(
      projectId
    );

  if (!project) {
    throw new Error(
      "Video project not found"
    );
  }

  const next = {
    ...project,

    renderStatus:
      status,

    renderProgress:
      patch.progress ??
      (
        status ===
        "SUCCEEDED"
          ? 100
          : project.renderProgress
      ),

    renderError:
      status === "FAILED"
        ? patch.error ||
          "Render failed"
        : undefined,

    outputUrl:
      patch.outputUrl ??
      project.outputUrl
  } as const;

  return saveVideoProject(
    next
  );
}
