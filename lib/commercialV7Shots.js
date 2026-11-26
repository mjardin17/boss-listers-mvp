"use strict";
const CAMERA = Object.freeze({ soft: 0.01, mid: 0.025, bold: 0.045 });

function makeShot({ id, productPhoto, startKeyframe = null, endKeyframe = null, camera = "mid", seconds = 3 }) {
  if (!id || !productPhoto) throw new Error("shot id and original product photo are required");
  if (!(camera in CAMERA)) throw new Error("camera must be soft, mid, or bold");
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 15) throw new Error("shot duration must be 1–15 seconds");
  return { id, productPhoto, productPixelsLocked: true, redrawProduct: false, camera, motionAmplitude: CAMERA[camera], seconds,
    startKeyframe: startKeyframe || { scale: 1, x: 0, y: 0 },
    endKeyframe: endKeyframe || { scale: 1 + CAMERA[camera], x: 0, y: 0 } };
}
function chainShots(shots) {
  const chained = [];
  for (const shot of shots || []) {
    const prior = chained[chained.length - 1];
    chained.push({ ...shot, startKeyframe: prior ? { ...prior.endKeyframe } : { ...shot.startKeyframe } });
  }
  return chained;
}
function rerunShot(shots, id, changes = {}) {
  const current = (shots || []).find((shot) => shot.id === id);
  if (!current) throw new Error(`unknown shot: ${id}`);
  const next = (shots || []).map((shot) => shot.id === id ? { ...shot, ...changes, id, productPhoto: shot.productPhoto, productPixelsLocked: true, redrawProduct: false, startKeyframe: { ...shot.startKeyframe } } : shot);
  return chainShots(next);
}
function repairOneSecond(shots, id, second, replacement) {
  const shot = (shots || []).find((row) => row.id === id);
  if (!shot) throw new Error(`unknown shot: ${id}`);
  if (!Number.isInteger(second) || second < 0 || second >= shot.seconds) throw new Error("second is outside the selected shot");
  const repairs = { ...(shot.repairs || {}), [second]: String(replacement || "").slice(0, 500) };
  return (shots || []).map((row) => row.id === id ? { ...row, repairs } : row);
}
module.exports = { CAMERA, makeShot, chainShots, rerunShot, repairOneSecond };
