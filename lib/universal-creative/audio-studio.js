#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Audio Studio
 *
 * Audio production for commercials:
 *   - AI voiceovers (Kokoro TTS via voice_music_factory.py)
 *   - Multiple voice options
 *   - Narration timing and synchronization
 *   - Background music (MusicGen beds)
 *   - Sound effects
 *   - Audio processing (normalize, fade, mix)
 *   - Audio-video synchronization
 *
 * Pure data + orchestration layer. Uses existing Python engines.
 * Never invents product claims or pricing.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_NARRATION_RATE = 1.0; // Kokoro speed multiplier
const VALID_VOICES = [
  "af_heart",
  "af_bella",
  "af_sarah",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bm_george",
];
const VALID_MUSIC_PROMPTS = [
  "upbeat cheerful commercial background music, no vocals",
  "corporate professional background music, no vocals",
  "energetic upbeat pop background music, no vocals",
  "calm ambient background music, no vocals",
  "dramatic cinematic background music, no vocals",
];

/**
 * Spawn Python with timeout and capture.
 */
function spawnPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 300000 } = options;
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonBin, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`python timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Generate a voiceover narration from text using Kokoro TTS.
 * Wraps scripts/voice_music_factory.py (4-beat narration with speed alignment).
 */
async function generateVoiceover(text, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `voiceover-${Date.now()}.wav`),
    voice = "af_heart",
    rate = DEFAULT_NARRATION_RATE,
    scriptPath = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "voice_music_factory.py"
    ),
  } = options;

  if (!VALID_VOICES.includes(voice)) {
    return {
      ok: false,
      error: `Invalid voice '${voice}'. Available: ${VALID_VOICES.join(", ")}`,
    };
  }

  if (rate <= 0 || rate > 3) {
    return { ok: false, error: "Rate must be between 0 and 3" };
  }

  try {
    const result = await spawnPython(
      [
        scriptPath,
        "--text",
        text,
        "--voice",
        voice,
        "--rate",
        String(rate),
        "--out",
        outputPath,
      ],
      { cwd: path.dirname(scriptPath) }
    );

    if (result.code === 0 && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return {
        ok: true,
        outputPath,
        method: "kokoro-tts",
        voice,
        rate,
        bytes: stats.size,
        durationEstimate: Math.ceil(text.length / 15), // rough: ~15 chars/sec
      };
    }
    return {
      ok: false,
      error: `Kokoro TTS failed: ${result.stderr}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate background music using MusicGen.
 * Wraps scripts/music_gen.py with channel prompts.
 */
async function generateMusic(options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `music-${Date.now()}.wav`),
    prompt = "upbeat cheerful commercial background music, no vocals",
    duration = 30, // seconds
    scriptPath = path.join(__dirname, "..", "..", "scripts", "music_gen.py"),
  } = options;

  if (!VALID_MUSIC_PROMPTS.includes(prompt)) {
    return {
      ok: false,
      error: `Invalid prompt. Available: ${VALID_MUSIC_PROMPTS.join(", ")}`,
    };
  }

  if (duration <= 0 || duration > 300) {
    return { ok: false, error: "Duration must be between 1 and 300 seconds" };
  }

  try {
    const result = await spawnPython(
      [
        scriptPath,
        "--prompt",
        prompt,
        "--duration",
        String(duration),
        "--out",
        outputPath,
      ],
      { cwd: path.dirname(scriptPath) }
    );

    if (result.code === 0 && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return {
        ok: true,
        outputPath,
        method: "musicgen",
        prompt,
        duration,
        bytes: stats.size,
      };
    }
    return { ok: false, error: `MusicGen failed: ${result.stderr}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Mix voiceover + background music into a single audio track.
 * Uses ffmpeg if available, otherwise returns both paths for the render engine.
 */
async function mixAudio(voiceoverPath, musicPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `mixed-${Date.now()}.wav`),
    voiceVolume = 1.0,
    musicVolume = 0.3,
    fadeIn = 0.5,
    fadeOut = 0.5,
  } = options;

  const ffmpegConfig = require("./registry.js").defaultRegistry.getConfig(
    "ffmpeg-local"
  );
  const { isAvailable, isVerified } = require("./manifest.js");

  if (ffmpegConfig && isAvailable(ffmpegConfig) && isVerified(ffmpegConfig)) {
    const { spawn } = require("child_process");
    return new Promise((resolve) => {
      const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
      const child = spawn(
        ffmpegBin,
        [
          "-i",
          voiceoverPath,
          "-i",
          musicPath,
          "-filter_complex",
          `[0:a]volume=${voiceVolume}[vo];[1:a]volume=${musicVolume}[bg];[vo][bg]amix=inputs=2:duration=first:dropout_transition=3[aout]`,
          "-map",
          "[aout]",
          "-y",
          outputPath,
        ],
        { windowsHide: true }
      );
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({
            ok: true,
            outputPath,
            method: "ffmpeg-mix",
            voiceVolume,
            musicVolume,
            bytes: fs.statSync(outputPath).size,
          });
        } else {
          resolve({
            ok: false,
            error: `ffmpeg mix failed: ${stderr}`,
            fallback: { voiceoverPath, musicPath },
          });
        }
      });
    });
  }

  // No ffmpeg — return both audio assets for the render engine to mix
  return {
    ok: true,
    outputPath: null,
    method: "no-mix",
    note: "ffmpeg not available — voiceover and music returned separately",
    assets: { voiceoverPath, musicPath },
    voiceVolume,
    musicVolume,
  };
}

/**
 * Synchronize narration timing with scenes.
 * Calculates when each scene's narration should start/end based on duration.
 */
function syncNarrationToScenes(scenes, narrationSegments) {
  const synced = [];
  let currentTime = 0;

  for (const scene of scenes) {
    const segment = narrationSegments.find((s) => s.sceneId === scene.id);
    synced.push({
      sceneId: scene.id,
      startTime: currentTime,
      endTime: currentTime + scene.duration,
      narrationText: segment ? segment.text : null,
      narrationStart: segment ? segment.startOffset : 0,
      narrationDuration: segment ? segment.duration : scene.duration,
    });
    currentTime += scene.duration;
  }

  return {
    totalDuration: currentTime,
    segments: synced,
  };
}

/**
 * Add sound effects (placeholder — references SFX library).
 */
function addSoundEffect(options = {}) {
  const {
    id = `sfx-${Date.now()}`,
    type = "whoosh", // whoosh, ding, pop, swipe, click
    startTime = 0,
    duration = 1,
    volume = 0.5,
  } = options;

  const VALID_SFX = ["whoosh", "ding", "pop", "swipe", "click", "whoosh"];
  if (!VALID_SFX.includes(type)) {
    throw new Error(`Invalid SFX type '${type}'. Available: ${VALID_SFX.join(", ")}`);
  }

  return {
    id,
    type,
    startTime,
    duration,
    volume,
    source: "sfx-library",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get available audio studio features.
 */
function getAvailableFeatures() {
  return {
    voices: VALID_VOICES,
    musicPrompts: VALID_MUSIC_PROMPTS,
    defaultNarrationRate: DEFAULT_NARRATION_RATE,
    sfxTypes: ["whoosh", "ding", "pop", "swipe", "click"],
    ffmpegMixing: false, // checked at runtime
  };
}

module.exports = {
  generateVoiceover,
  generateMusic,
  mixAudio,
  syncNarrationToScenes,
  addSoundEffect,
  getAvailableFeatures,
  VALID_VOICES,
  VALID_MUSIC_PROMPTS,
  DEFAULT_NARRATION_RATE,
};
