/**
 * Universal Creative Production Connector — Preset Connector Definitions
 *
 * These are the creative applications from the directive's ecosystem that
 * the connector framework supports. Each preset is a capability manifest with
 * integration method, resource requirements, supported formats, and example
 * commands.
 *
 * STATUS RULE: every preset registers with status `unknown`. None are
 * assumed available until `registry.probe()` runs. Apps not installed in
 * this environment register as `unavailable`/`unverified` — we never claim
 * an integration that hasn't been tested.
 */

const {
  ApplicationCategory,
  IntegrationMethod,
  ExecutionDomain,
  ConnectionStatus,
  defaultConnectorConfig,
} = require("./manifest.js");

const base = (overrides = {}) => {
  const now = new Date().toISOString();
  const raw = {
    id: overrides.id || "",
    name: overrides.name || "",
    version: overrides.version || "1.0.0",
    category: overrides.category || ApplicationCategory.other,
    method: overrides.method || IntegrationMethod.cli,
    domain: overrides.domain || ExecutionDomain.local,
    status: ConnectionStatus.unknown,
    executable_path: overrides.executable_path,
    working_directory: overrides.working_directory,
    port: overrides.port,
    base_url: overrides.base_url,
    api_key_env: overrides.api_key_env,
    commands: overrides.commands || [],
    capabilities: overrides.capabilities || [],
    permissions: overrides.permissions || [],
    resource_requirements: overrides.resource_requirements || {},
    supported_formats: overrides.supported_formats || [],
    verification_history: [],
    notes: overrides.notes,
  };
  // Omit null/undefined so optional Zod fields accept "not set".
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) cleaned[key] = value;
  }
  return cleaned;
};

function versionCommand(id, executable, args = ["--version"]) {
  return {
    id,
    name: `version check (${executable})`,
    executable,
    args,
    timeout_seconds: 15,
    retry: 1,
  };
}

/* ================================================================
 * 3D and Animation
 * ================================================================ */

const blenderPreset = base({
  id: "blender-local",
  name: "Blender (local)",
  category: ApplicationCategory["3d"],
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/blender",
  commands: [
    versionCommand("blender:version", "blender"),
    {
      id: "blender:render",
      name: "Blender render",
      executable: "blender",
      args: ["--background", "--python", "{{script}}"],
      env: {},
      timeout_seconds: 3600,
      retry: 0,
    },
  ],
  capabilities: [
    {
      id: "blender.render",
      name: "Render 3D scene",
      description: "Render a Blender .blend scene to image/video",
      input_formats: [".blend", ".py"],
      output_formats: [".png", ".jpg", ".mp4", ".avi"],
      example_params: { script: "/path/to/render_script.py" },
    },
    {
      id: "blender.model",
      name: "3D modeling",
      description: "Create/edit 3D models",
      input_formats: [".blend", ".obj", ".fbx", ".gltf"],
      output_formats: [".blend", ".obj", ".fbx", ".gltf"],
    },
  ],
  permissions: [
    {
      id: "blender:filesystem:read",
      description: "Read .blend and asset files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "blender:filesystem:write",
      description: "Write rendered output files",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: {
    cpu: "4 vCPU",
    ram: "8 GB",
    gpu: "GPU optional (CUDA/OptiX recommended)",
    storage_gb: 4,
    network: false,
  },
  supported_formats: [".blend", ".obj", ".fbx", ".gltf", ".png", ".jpg", ".mp4", ".avi"],
  notes:
    "Not installed in this sandbox. Registers as unverified until a working blender binary is found and probed.",
});

const freecadPreset = base({
  id: "freecad-local",
  name: "FreeCAD (local)",
  category: ApplicationCategory["3d"],
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/freecad",
  commands: [versionCommand("freecad:version", "freecad")],
  capabilities: [
    {
      id: "freecad.model",
      name: "Parametric 3D modeling",
      input_formats: [".FCStd", ".step", ".stl"],
      output_formats: [".FCStd", ".step", ".stl", ".obj"],
    },
  ],
  permissions: [
    {
      id: "freecad:filesystem:read",
      description: "Read model files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "freecad:filesystem:write",
      description: "Write model/export files",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "4 GB", storage_gb: 2 },
  supported_formats: [".FCStd", ".step", ".stl", ".obj"],
  notes: "Not installed in this sandbox.",
});

const openscadPreset = base({
  id: "openscad-local",
  name: "OpenSCAD (local)",
  category: ApplicationCategory["3d"],
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/openscad",
  commands: [versionCommand("openscad:version", "openscad")],
  capabilities: [
    {
      id: "openscad.render",
      name: "Render CSG script to geometry",
      input_formats: [".scad"],
      output_formats: [".stl", ".off", ".dxf", ".csg"],
      example_params: { file: "/path/to/model.scad" },
    },
  ],
  permissions: [
    {
      id: "openscad:filesystem:read",
      description: "Read .scad files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "openscad:filesystem:write",
      description: "Write exported geometry",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1 },
  supported_formats: [".scad", ".stl", ".off", ".dxf", ".csg"],
  notes: "Not installed in this sandbox.",
});

const meshlabPreset = base({
  id: "meshlab-local",
  name: "MeshLab (local)",
  category: ApplicationCategory["3d"],
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/meshlab",
  commands: [versionCommand("meshlab:version", "meshlab")],
  capabilities: [
    {
      id: "meshlab.process",
      name: "Mesh processing / cleaning",
      input_formats: [".obj", ".stl", ".ply", ".off"],
      output_formats: [".obj", ".stl", ".ply"],
    },
  ],
  permissions: [
    {
      id: "meshlab:filesystem:read",
      description: "Read mesh files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "meshlab:filesystem:write",
      description: "Write processed meshes",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "4 GB", storage_gb: 2 },
  supported_formats: [".obj", ".stl", ".ply", ".off"],
  notes: "Not installed in this sandbox.",
});

/* ================================================================
 * Graphics and Design
 * ================================================================ */

const gimpPreset = base({
  id: "gimp-local",
  name: "GIMP (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/gimp",
  commands: [versionCommand("gimp:version", "gimp")],
  capabilities: [
    {
      id: "gimp.edit",
      name: "Image editing",
      description: "Batch image editing via Script-Fu / Python-Fu",
      input_formats: [".xcf", ".png", ".jpg", ".tif", ".psd"],
      output_formats: [".xcf", ".png", ".jpg", ".tif", ".psd"],
    },
  ],
  permissions: [
    {
      id: "gimp:filesystem:read",
      description: "Read image files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "gimp:filesystem:write",
      description: "Write edited images",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "4 GB", storage_gb: 1 },
  supported_formats: [".xcf", ".png", ".jpg", ".tif", ".psd"],
  notes: "Not installed in this sandbox.",
});

const inkscapePreset = base({
  id: "inkscape-local",
  name: "Inkscape (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/inkscape",
  commands: [versionCommand("inkscape:version", "inkscape")],
  capabilities: [
    {
      id: "inkscape.convert",
      name: "SVG conversion / export",
      input_formats: [".svg"],
      output_formats: [".png", ".pdf", ".eps", ".ps"],
    },
  ],
  permissions: [
    {
      id: "inkscape:filesystem:read",
      description: "Read SVG files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "inkscape:filesystem:write",
      description: "Write exported files",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1 },
  supported_formats: [".svg", ".png", ".pdf", ".eps", ".ps"],
  notes: "Not installed in this sandbox.",
});

const kritaPreset = base({
  id: "krita-local",
  name: "Krita (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/krita",
  commands: [versionCommand("krita:version", "krita")],
  capabilities: [
    {
      id: "krita.paint",
      name: "Digital painting / image editing",
      input_formats: [".kra", ".png", ".jpg", ".tif"],
      output_formats: [".kra", ".png", ".jpg", ".tif"],
    },
  ],
  permissions: [
    {
      id: "krita:filesystem:read",
      description: "Read image files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "krita:filesystem:write",
      description: "Write image files",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "4 GB", storage_gb: 1 },
  supported_formats: [".kra", ".png", ".jpg", ".tif"],
  notes: "Not installed in this sandbox.",
});

const darktablePreset = base({
  id: "darktable-local",
  name: "Darktable (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/darktable",
  commands: [versionCommand("darktable:version", "darktable")],
  capabilities: [
    {
      id: "darktable.develop",
      name: "RAW photo development",
      input_formats: [".raw", ".cr2", ".nef", ".arw", ".dng"],
      output_formats: [".jpg", ".tif", ".png"],
    },
  ],
  permissions: [
    {
      id: "darktable:filesystem:read",
      description: "Read RAW files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "darktable:filesystem:write",
      description: "Write developed images",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: {
    cpu: "4 vCPU",
    ram: "8 GB",
    gpu: "GPU recommended",
    storage_gb: 2,
  },
  supported_formats: [".raw", ".cr2", ".nef", ".arw", ".dng", ".jpg", ".tif", ".png"],
  notes: "Not installed in this sandbox.",
});

const imagemagickPreset = base({
  id: "imagemagick-local",
  name: "ImageMagick (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/magick",
  commands: [
    versionCommand("imagemagick:version", "magick"),
    {
      id: "imagemagick:convert",
      name: "Image convert / resize",
      executable: "magick",
      args: ["{{input}}", "{{options}}", "{{output}}"],
      timeout_seconds: 120,
      retry: 0,
    },
  ],
  capabilities: [
    {
      id: "imagemagick.convert",
      name: "Convert / resize / process images",
      input_formats: [
        ".png",
        ".jpg",
        ".jpeg",
        ".tif",
        ".webp",
        ".svg",
        ".pdf",
      ],
      output_formats: [".png", ".jpg", ".jpeg", ".tif", ".webp", ".gif"],
      example_params: {
        input: "in.png",
        output: "out.jpg",
        options: "-resize 1920x1080",
      },
    },
    {
      id: "imagemagick.montage",
      name: "Image montage / contact sheet",
      input_formats: [".png", ".jpg", ".jpeg"],
      output_formats: [".png", ".jpg"],
    },
  ],
  permissions: [
    {
      id: "imagemagick:filesystem:read",
      description: "Read source images",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "imagemagick:filesystem:write",
      description: "Write processed images",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1 },
  supported_formats: [
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".webp",
    ".svg",
    ".pdf",
    ".gif",
  ],
  notes:
    "Installed at /usr/bin/magick in this sandbox. Probe-verified available.",
});

const scribusPreset = base({
  id: "scribus-local",
  name: "Scribus (local)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/scribus",
  commands: [versionCommand("scribus:version", "scribus")],
  capabilities: [
    {
      id: "scribus.layout",
      name: "Desktop publishing / layout",
      input_formats: [".sla"],
      output_formats: [".pdf", ".svg", ".png"],
    },
  ],
  permissions: [
    {
      id: "scribus:filesystem:read",
      description: "Read .sla files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "scribus:filesystem:write",
      description: "Write exported documents",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1 },
  supported_formats: [".sla", ".pdf", ".svg", ".png"],
  notes: "Not installed in this sandbox.",
});

const penpotPreset = base({
  id: "penpot-local",
  name: "Penpot (local/self-hosted)",
  category: ApplicationCategory.graphics,
  method: IntegrationMethod.native_api,
  domain: ExecutionDomain.local,
  base_url: null,
  commands: [],
  capabilities: [
    {
      id: "penpot.design",
      name: "UI/UX design",
      input_formats: [".svg", ".penpot"],
      output_formats: [".svg", ".png", ".pdf"],
    },
  ],
  permissions: [
    {
      id: "penpot:api",
      description: "Access Penpot API",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1, network: true },
  supported_formats: [".svg", ".penpot", ".png", ".pdf"],
  notes: "No self-hosted Penpot instance configured. base_url not set.",
});

/* ================================================================
 * Video
 * ================================================================ */

const davinciResolvePreset = base({
  id: "davinci-resolve-local",
  name: "DaVinci Resolve (local)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/resolve",
  commands: [versionCommand("davinci:version", "resolve")],
  capabilities: [
    {
      id: "davinci.edit",
      name: "Professional video editing and color grading",
      input_formats: [".mp4", ".mov", ".avi", ".mkv", ".mxf", ".braw"],
      output_formats: [".mp4", ".mov", ".avi", ".mxf"],
    },
  ],
  permissions: [
    {
      id: "davinci:filesystem:read",
      description: "Read media files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "davinci:filesystem:write",
      description: "Write rendered video",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: {
    cpu: "8 vCPU",
    ram: "16 GB",
    gpu: "GPU required",
    storage_gb: 10,
    network: false,
  },
  supported_formats: [".mp4", ".mov", ".avi", ".mkv", ".mxf", ".braw"],
  notes: "Not installed in this sandbox.",
});

const kdenlivePreset = base({
  id: "kdenlive-local",
  name: "Kdenlive (local)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/kdenlive",
  commands: [versionCommand("kdenlive:version", "kdenlive")],
  capabilities: [
    {
      id: "kdenlive.edit",
      name: "Multi-track video editing",
      input_formats: [".mp4", ".mov", ".avi", ".mkv"],
      output_formats: [".mp4", ".mov", ".mkv"],
    },
  ],
  permissions: [
    {
      id: "kdenlive:filesystem:read",
      description: "Read media files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "kdenlive:filesystem:write",
      description: "Write rendered video",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "8 GB", storage_gb: 5 },
  supported_formats: [".mp4", ".mov", ".avi", ".mkv"],
  notes: "Not installed in this sandbox.",
});

const shotcutPreset = base({
  id: "shotcut-local",
  name: "Shotcut (local)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/shotcut",
  commands: [versionCommand("shotcut:version", "shotcut")],
  capabilities: [
    {
      id: "shotcut.edit",
      name: "Video editing",
      input_formats: [".mp4", ".mov", ".avi", ".mkv"],
      output_formats: [".mp4", ".mov", ".mkv"],
    },
  ],
  permissions: [
    {
      id: "shotcut:filesystem:read",
      description: "Read media files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "shotcut:filesystem:write",
      description: "Write rendered video",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "4 GB", storage_gb: 3 },
  supported_formats: [".mp4", ".mov", ".avi", ".mkv"],
  notes: "Not installed in this sandbox.",
});

const natronPreset = base({
  id: "natron-local",
  name: "Natron (local)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/natron",
  commands: [versionCommand("natron:version", "natron")],
  capabilities: [
    {
      id: "natron.composite",
      name: "Compositing / VFX",
      input_formats: [".exr", ".png", ".mov", ".mp4"],
      output_formats: [".exr", ".png", ".mov"],
    },
  ],
  permissions: [
    {
      id: "natron:filesystem:read",
      description: "Read plates/assets",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "natron:filesystem:write",
      description: "Write composited output",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: {
    cpu: "4 vCPU",
    ram: "8 GB",
    gpu: "GPU recommended",
    storage_gb: 5,
  },
  supported_formats: [".exr", ".png", ".mov", ".mp4"],
  notes: "Not installed in this sandbox.",
});

const ffmpegPreset = base({
  id: "ffmpeg-local",
  name: "FFmpeg (local)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/ffmpeg",
  commands: [
    versionCommand("ffmpeg:version", "ffmpeg"),
    {
      id: "ffmpeg:encode",
      name: "Encode / transcode video",
      executable: "ffmpeg",
      args: ["-i", "{{input}}", "{{options}}", "{{output}}"],
      timeout_seconds: 3600,
      retry: 0,
    },
    {
      id: "ffmpeg:probe",
      name: "Probe media file",
      executable: "ffprobe",
      args: ["-v", "error", "-show_format", "-show_streams", "{{input}}"],
      timeout_seconds: 60,
      retry: 0,
    },
  ],
  capabilities: [
    {
      id: "ffmpeg.transcode",
      name: "Transcode video/audio",
      input_formats: [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wav", ".mp3"],
      output_formats: [".mp4", ".mov", ".webm", ".mp3", ".wav"],
      example_params: {
        input: "in.mov",
        output: "out.mp4",
        options: "-c:v libx264 -crf 23 -c:a aac",
      },
    },
    {
      id: "ffmpeg.resize",
      name: "Resize / aspect-ratio adjust",
      input_formats: [".mp4", ".mov", ".avi", ".mkv"],
      output_formats: [".mp4", ".mov", ".webm"],
    },
    {
      id: "ffmpeg.extract_audio",
      name: "Extract audio track",
      input_formats: [".mp4", ".mov", ".avi", ".mkv"],
      output_formats: [".wav", ".mp3", ".aac"],
    },
  ],
  permissions: [
    {
      id: "ffmpeg:filesystem:read",
      description: "Read media files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "ffmpeg:filesystem:write",
      description: "Write encoded output",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "4 GB", storage_gb: 5, network: false },
  supported_formats: [".mp4", ".mov", ".avi", ".mkv", ".webm", ".mp3", ".wav", ".aac"],
  notes:
    "Not installed in this sandbox (no ffmpeg on PATH). Registers as unverified/unavailable until installed.",
});

const remotionPreset = base({
  id: "remotion-node",
  name: "Remotion (Node library, BossListers)",
  category: ApplicationCategory.video,
  method: IntegrationMethod.native_api,
  domain: ExecutionDomain.local,
  working_directory: process.cwd(),
  commands: [],
  capabilities: [
    {
      id: "remotion.render",
      name: "Remotion video render",
      input_formats: [".tsx", ".ts", ".js", ".json"],
      output_formats: [".mp4", ".webm"],
      example_params: { composition: "CardShowcaseComposition", props: "{}" },
    },
  ],
  permissions: [
    {
      id: "remotion:filesystem:read",
      description: "Read composition source",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "remotion:filesystem:write",
      description: "Write rendered video",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "8 GB", storage_gb: 2, network: false },
  supported_formats: [".tsx", ".ts", ".js", ".json", ".mp4", ".webm"],
  notes:
    "Used in BossListers via Node code (video/CardShowcaseComposition.tsx). Not a CLI binary.",
});

/* ================================================================
 * Audio
 * ================================================================ */

const audacityPreset = base({
  id: "audacity-local",
  name: "Audacity (local)",
  category: ApplicationCategory.audio,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/audacity",
  commands: [versionCommand("audacity:version", "audacity")],
  capabilities: [
    {
      id: "audacity.edit",
      name: "Audio editing",
      input_formats: [".wav", ".mp3", ".aac", ".flac", ".aup3"],
      output_formats: [".wav", ".mp3", ".aac", ".flac"],
    },
  ],
  permissions: [
    {
      id: "audacity:filesystem:read",
      description: "Read audio files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "audacity:filesystem:write",
      description: "Write edited audio",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 2 },
  supported_formats: [".wav", ".mp3", ".aac", ".flac", ".aup3"],
  notes: "Not installed in this sandbox.",
});

const ardourPreset = base({
  id: "ardour-local",
  name: "Ardour (local)",
  category: ApplicationCategory.audio,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/ardour",
  commands: [versionCommand("ardour:version", "ardour")],
  capabilities: [
    {
      id: "ardour.produce",
      name: "Audio production / mixing",
      input_formats: [".wav", ".aif", ".flac"],
      output_formats: [".wav", ".aif", ".flac"],
    },
  ],
  permissions: [
    {
      id: "ardour:filesystem:read",
      description: "Read session/audio files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "ardour:filesystem:write",
      description: "Write mixed audio",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "4 GB", storage_gb: 4 },
  supported_formats: [".wav", ".aif", ".flac"],
  notes: "Not installed in this sandbox.",
});

const lmmsPreset = base({
  id: "lmms-local",
  name: "LMMS (local)",
  category: ApplicationCategory.audio,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/lmms",
  commands: [versionCommand("lmms:version", "lmms")],
  capabilities: [
    {
      id: "lmms.compose",
      name: "Music composition",
      input_formats: [".mmpz"],
      output_formats: [".wav", ".mp3", ".ogg"],
    },
  ],
  permissions: [
    {
      id: "lmms:filesystem:read",
      description: "Read project files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "lmms:filesystem:write",
      description: "Write rendered audio",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 2 },
  supported_formats: [".mmpz", ".wav", ".mp3", ".ogg"],
  notes: "Not installed in this sandbox.",
});

const reaperPreset = base({
  id: "reaper-local",
  name: "REAPER (local)",
  category: ApplicationCategory.audio,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/Reaper",
  commands: [versionCommand("reaper:version", "reaper")],
  capabilities: [
    {
      id: "reaper.produce",
      name: "Audio production",
      input_formats: [".rpp", ".wav"],
      output_formats: [".wav", ".mp3", ".flac"],
    },
  ],
  permissions: [
    {
      id: "reaper:filesystem:read",
      description: "Read project/audio files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "reaper:filesystem:write",
      description: "Write rendered audio",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 2 },
  supported_formats: [".rpp", ".wav", ".mp3", ".flac"],
  notes: "Not installed in this sandbox.",
});

/* ================================================================
 * Documents
 * ================================================================ */

const libreofficePreset = base({
  id: "libreoffice-local",
  name: "LibreOffice (local)",
  category: ApplicationCategory.documents,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/soffice",
  commands: [versionCommand("libreoffice:version", "soffice")],
  capabilities: [
    {
      id: "libreoffice.convert",
      name: "Document conversion",
      input_formats: [".docx", ".doc", ".odt", ".xlsx", ".pptx", ".odp"],
      output_formats: [".pdf", ".docx", ".odt", ".xlsx", ".pptx", ".html"],
    },
  ],
  permissions: [
    {
      id: "libreoffice:filesystem:read",
      description: "Read documents",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "libreoffice:filesystem:write",
      description: "Write converted documents",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1 },
  supported_formats: [
    ".docx",
    ".doc",
    ".odt",
    ".xlsx",
    ".pptx",
    ".odp",
    ".pdf",
    ".html",
  ],
  notes: "Not installed in this sandbox.",
});

const onlyofficePreset = base({
  id: "onlyoffice-local",
  name: "ONLYOFFICE (local/self-hosted)",
  category: ApplicationCategory.documents,
  method: IntegrationMethod.native_api,
  domain: ExecutionDomain.local,
  base_url: null,
  commands: [],
  capabilities: [
    {
      id: "onlyoffice.edit",
      name: "Document editing",
      input_formats: [".docx", ".xlsx", ".pptx"],
      output_formats: [".docx", ".xlsx", ".pptx", ".pdf"],
    },
  ],
  permissions: [
    {
      id: "onlyoffice:api",
      description: "Access ONLYOFFICE API",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", storage_gb: 1, network: true },
  supported_formats: [".docx", ".xlsx", ".pptx", ".pdf"],
  notes: "No self-hosted ONLYOFFICE instance configured.",
});

/* ================================================================
 * Game and Interactive Content
 * ================================================================ */

const godotPreset = base({
  id: "godot-local",
  name: "Godot (local)",
  category: ApplicationCategory.game,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/godot",
  commands: [versionCommand("godot:version", "godot")],
  capabilities: [
    {
      id: "godot.build",
      name: "Build / run Godot project",
      input_formats: [".godot"],
      output_formats: [".apk", ".exe", ".mac", ".pck"],
    },
  ],
  permissions: [
    {
      id: "godot:filesystem:read",
      description: "Read project files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "godot:filesystem:write",
      description: "Write build output",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "4 vCPU", ram: "4 GB", gpu: "GPU recommended", storage_gb: 4 },
  supported_formats: [".godot", ".apk", ".exe", ".mac", ".pck"],
  notes: "Not installed in this sandbox.",
});

const unityPreset = base({
  id: "unity-local",
  name: "Unity (local)",
  category: ApplicationCategory.game,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/unity",
  commands: [versionCommand("unity:version", "unity")],
  capabilities: [
    {
      id: "unity.build",
      name: "Build Unity project",
      input_formats: [".unity"],
      output_formats: [".apk", ".exe", ".app", ".webgl"],
    },
  ],
  permissions: [
    {
      id: "unity:filesystem:read",
      description: "Read project files",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "unity:filesystem:write",
      description: "Write build output",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "8 vCPU", ram: "16 GB", gpu: "GPU recommended", storage_gb: 20 },
  supported_formats: [".unity", ".apk", ".exe", ".app", ".webgl"],
  notes: "Not installed in this sandbox.",
});

const materialMakerPreset = base({
  id: "material-maker-local",
  name: "Material Maker (local)",
  category: ApplicationCategory.game,
  method: IntegrationMethod.cli,
  domain: ExecutionDomain.local,
  executable_path: "/usr/bin/material-maker",
  commands: [versionCommand("material-maker:version", "material-maker")],
  capabilities: [
    {
      id: "material-maker.generate",
      name: "Generate PBR materials",
      input_formats: [".mm", ".png", ".jpg"],
      output_formats: [".png", ".tga", ".exr"],
    },
  ],
  permissions: [
    {
      id: "material-maker:filesystem:read",
      description: "Read material sources",
      granted: false,
      requires_user_approval: true,
    },
    {
      id: "material-maker:filesystem:write",
      description: "Write generated maps",
      granted: false,
      requires_user_approval: true,
    },
  ],
  resource_requirements: { cpu: "2 vCPU", ram: "2 GB", gpu: "GPU recommended", storage_gb: 2 },
  supported_formats: [".mm", ".png", ".jpg", ".png", ".tga", ".exr"],
  notes: "Not installed in this sandbox.",
});

/* ================================================================
 * Registry preset list (all presets, registered unknown until probed)
 * ================================================================ */

const allPresets = [
  blenderPreset,
  freecadPreset,
  openscadPreset,
  meshlabPreset,
  gimpPreset,
  inkscapePreset,
  kritaPreset,
  darktablePreset,
  imagemagickPreset,
  scribusPreset,
  penpotPreset,
  davinciResolvePreset,
  kdenlivePreset,
  shotcutPreset,
  natronPreset,
  ffmpegPreset,
  remotionPreset,
  audacityPreset,
  ardourPreset,
  lmmsPreset,
  reaperPreset,
  libreofficePreset,
  onlyofficePreset,
  godotPreset,
  unityPreset,
  materialMakerPreset,
];

module.exports = {
  base,
  versionCommand,
  blenderPreset,
  freecadPreset,
  openscadPreset,
  meshlabPreset,
  gimpPreset,
  inkscapePreset,
  kritaPreset,
  darktablePreset,
  imagemagickPreset,
  scribusPreset,
  penpotPreset,
  davinciResolvePreset,
  kdenlivePreset,
  shotcutPreset,
  natronPreset,
  ffmpegPreset,
  remotionPreset,
  audacityPreset,
  ardourPreset,
  lmmsPreset,
  reaperPreset,
  libreofficePreset,
  onlyofficePreset,
  godotPreset,
  unityPreset,
  materialMakerPreset,
  allPresets,
};
