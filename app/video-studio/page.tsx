import {
  VideoStudioClient
} from "../../components/video-studio/VideoStudioClient";

import {
  getVideoProject
} from "../../lib/video-studio/projectStore";

export const dynamic =
  "force-dynamic";

export default async function VideoStudioPage({
  searchParams
}: {
  searchParams: {
    project?: string;
  };
}) {
  const project =
    searchParams.project
      ? await getVideoProject(
          searchParams.project
        )
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <VideoStudioClient
          initialProject={
            project
          }
        />
      </div>
    </main>
  );
}
