"use client";

import {
  useMemo,
  useState
} from "react";

import type {
  VideoProject,
  VideoScene
} from "../../lib/video-studio/types";

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
  initialProject
}: {
  initialProject?:
    | VideoProject
    | null;
}) {
  const [
    project,
    setProject
  ] =
    useState<
      VideoProject | null
    >(
      initialProject ||
        null
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
      await fetch(
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
      await fetch(
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
