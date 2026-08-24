export function scoreImageCompliance({ imageCount = 0, platform = "" }: { imageCount?: number; platform?: string }) {
  const required = platform === "amazon" || platform === "walmart" ? 3 : 1;
  return {
    imageScore: Math.max(0, Math.min(100, Math.round((imageCount / Math.max(required, 1)) * 100))),
    warnings: imageCount < required ? [`${platform || "Platform"} needs at least ${required} usable image(s).`] : []
  };
}
