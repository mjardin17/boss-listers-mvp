"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  VideoProject,
  VideoScene
} from "../../lib/video-studio/types";

import { authedFetch } from "../../lib/clientAuth";

const POLL_INTERVAL_MS = 2000;
const IN_FLIGHT_STATUSES = new Set([
  "QUEUED",
  "RENDERING"
]);

function uid() {
  return (
    globalThis.crypto
      ?.randomUUID?.() ||
    `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  );
}

export function VideoStudioClient({
  projectId
}: {
  projectId?:
    | string
    | null;
}) {
  const [
    project,
    setProject
  ] =
    useState<
      VideoProject | null
    >(
      null
    );

  const [
    loading,
    setLoading
  ] =
    useState(
      Boolean(
        projectId
      )
    );

  const [
    assetUrl,
    setAssetUrl
  ] =
    useState("");

  const [
    busy,
    setBusy
  ] =
    useState(false);

  const projectIdRef =
    useRef<string | null>(
      null
    );

  useEffect(() => {
    projectIdRef.current =
      project?.id || null;
  }, [project?.id]);

  // The server component can't resolve a session (tokens live in
  // localStorage, not a cookie — see lib/clientAuth.js), so this client
  // component loads the project itself once it has a real token to send.
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response =
          await authedFetch(
            `/api/video-studio/projects/${projectId}`
          );

        const data =
          await response.json();

        if (
          !cancelled &&
          response.ok
        ) {
          setProject(
            data.project
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(
            false
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (
      !project ||
      !IN_FLIGHT_STATUSES.has(
        project.renderStatus
      )
    ) {
      return;
    }

    // Polls the real render status the worker process writes to disk —
    // stops itself as soon as the status leaves QUEUED/RENDERING, or if
    // the project changes out from under it (e.g. user navigates away).
    const interval =
      setInterval(
        async () => {
          const id =
            projectIdRef.current;

          if (!id) {
            return;
          }

          try {
            const response =
              await authedFetch(
                `/api/video-studio/projects/${id}`
              );

            if (
              !response.ok
            ) {
              return;
            }

            const data =
              await response.json();

            if (
              projectIdRef.current ===
              id
            ) {
              setProject(
                data.project
              );
            }
          } catch {
            // Transient poll failure — try again on the next tick rather
            // than surfacing a disruptive error for a background check.
          }
        },
        POLL_INTERVAL_MS
      );

    return () =>
      clearInterval(
        interval
      );
  }, [
    project?.id,
    project?.renderStatus
  ]);

  const duration =
    useMemo(
      () =>
        project?.scenes.reduce(
          (
            sum,
            scene
          ) =>
            sum +
            scene.durationSeconds,
          0
        ) || 0,
      [project]
    );

  async function save() {
    if (!project) {
      return;
    }

    setBusy(true);

    const response =
      await authedFetch(
        `/api/video-studio/projects/${project.id}`,
        {
          method:
            "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              project
            )
        }
      );

    const data =
      await response.json();

    setBusy(false);

    if (!response.ok) {
      alert(
        data.error ||
          "Save failed"
      );

      return;
    }

    setProject(
      data.project
    );
  }

  async function render() {
    if (!project) {
      return;
    }

    await save();

    const response =
      await authedFetch(
        "/api/video-studio/render",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              projectId:
                project.id
            })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      alert(
        data.error ||
          "Render failed to queue"
      );

      return;
    }

    setProject({
      ...project,
      renderStatus:
        "QUEUED",
      renderProgress: 0
    });
  }

  function addScene() {
    if (
      !project ||
      !assetUrl.trim()
    ) {
      return;
    }

    const scene: VideoScene =
      {
        id: uid(),

        assetUrl:
          assetUrl.trim(),

        assetType:
          "image",

        durationSeconds:
          3.5,

        headline:
          "New scene",

        supportingText:
          "",

        textPosition:
          "bottom",

        transition:
          "fade",

        motion:
          "zoom-in",

        cropMode:
          "cover"
      };

    setProject({
      ...project,

      scenes: [
        ...project.scenes,
        scene
      ],

      updatedAt:
        new Date()
          .toISOString()
    });

    setAssetUrl("");
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
        Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
        Open Video Studio from inventory with{" "}
        <strong>
          Create Video
        </strong>
        .
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

      <section className="space-y-4">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>
              <h1 className="text-2xl font-black">
                Video Studio
              </h1>

              <p className="text-sm text-zinc-400">
                {project.aspectRatio}
                {" · "}
                {duration.toFixed(
                  1
                )}
                s
                {" · "}
                {project.scenes.length}
                {" "}
                scenes
              </p>
            </div>

            <div className="flex gap-2">

              <button
                disabled={
                  busy
                }
                onClick={
                  save
                }
                className="rounded-xl border border-zinc-700 px-4 py-2"
              >
                Save
              </button>

              <button
                disabled={
                  busy
                }
                onClick={
                  render
                }
                className="rounded-xl bg-emerald-400 px-4 py-2 font-bold text-black"
              >
                Render MP4
              </button>

            </div>

          </div>

        </div>

        {project.scenes.map(
          (
            scene,
            index
          ) => (

            <div
              key={
                scene.id
              }
              className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
            >

              <div className="grid gap-3 sm:grid-cols-[96px_1fr]">

                <div className="aspect-[9/16] overflow-hidden rounded-xl bg-zinc-950">

                  {scene.assetUrl ? (
                    <img
                      src={
                        scene.assetUrl
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}

                </div>

                <div className="space-y-3">

                  <div className="flex justify-between">

                    <span className="text-xs uppercase tracking-widest text-zinc-500">
                      Scene{" "}
                      {index + 1}
                    </span>

                    <button
                      onClick={() =>
                        setProject({
                          ...project,

                          scenes:
                            project.scenes.filter(
                              (
                                candidate
                              ) =>
                                candidate.id !==
                                scene.id
                            )
                        })
                      }
                      className="text-xs text-red-300"
                    >
                      Delete
                    </button>

                  </div>

                  <input
                    value={
                      scene.headline
                    }
                    onChange={(
                      event
                    ) =>
                      setProject({
                        ...project,

                        scenes:
                          project.scenes.map(
                            (
                              candidate
                            ) =>
                              candidate.id ===
                              scene.id
                                ? {
                                    ...candidate,
                                    headline:
                                      event
                                        .target
                                        .value
                                  }
                                : candidate
                          )
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  />

                  <textarea
                    value={
                      scene.supportingText
                    }
                    onChange={(
                      event
                    ) =>
                      setProject({
                        ...project,

                        scenes:
                          project.scenes.map(
                            (
                              candidate
                            ) =>
                              candidate.id ===
                              scene.id
                                ? {
                                    ...candidate,
                                    supportingText:
                                      event
                                        .target
                                        .value
                                  }
                                : candidate
                          )
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  />

                </div>

              </div>

            </div>
          )
        )}

        <div className="rounded-3xl border border-dashed border-zinc-700 p-4">

          <div className="flex gap-2">

            <input
              value={
                assetUrl
              }
              onChange={(
                event
              ) =>
                setAssetUrl(
                  event.target
                    .value
                )
              }
              placeholder="Image/video URL"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />

            <button
              onClick={
                addScene
              }
              className="rounded-xl border border-zinc-700 px-4 py-2"
            >
              Add scene
            </button>

          </div>

        </div>

      </section>

      <aside className="space-y-4">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">

          <p className="text-xs uppercase tracking-widest text-zinc-500">
            CTA
          </p>

          <input
            value={
              project.cta
                .text
            }
            onChange={(
              event
            ) =>
              setProject({
                ...project,

                cta: {
                  ...project.cta,
                  text:
                    event.target
                      .value
                }
              })
            }
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />

          <input
            value={
              project.cta
                .destinationUrl ||
              ""
            }
            onChange={(
              event
            ) =>
              setProject({
                ...project,

                cta: {
                  ...project.cta,
                  destinationUrl:
                    event.target
                      .value
                }
              })
            }
            placeholder="https://..."
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">

          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Render
          </p>

          <p className="mt-2 font-bold">
            {
              project.renderStatus
            }
          </p>

          <p className="text-sm text-zinc-400">
            {
              project.renderProgress
            }
            %
          </p>

          {project.renderError ? (
            <p className="mt-2 text-sm text-red-300">
              {
                project.renderError
              }
            </p>
          ) : null}

          {project.outputUrl ? (
            <a
              href={
                project.outputUrl
              }
              className="mt-3 inline-block text-emerald-300 underline"
            >
              Open MP4
            </a>
          ) : null}

        </div>

      </aside>

    </div>
  );
}
