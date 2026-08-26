import {
  VideoStudioClient
} from "../../components/video-studio/VideoStudioClient";

export const dynamic =
  "force-dynamic";

export default function VideoStudioPage({
  searchParams
}: {
  searchParams: {
    project?: string;
  };
}) {
  // Sessions live in the browser (localStorage, see lib/clientAuth.js),
  // not a cookie — a server component has no way to resolve a tenantId
  // here, so this no longer fetches the project server-side. The client
  // component loads it itself via authedFetch, which actually has the
  // token available.
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <VideoStudioClient
          projectId={
            searchParams.project ||
            null
          }
        />
      </div>
    </main>
  );
}
