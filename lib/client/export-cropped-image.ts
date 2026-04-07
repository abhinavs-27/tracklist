import type { Area } from "react-easy-crop";

const OUTPUT_SIZE = 512;
const MAX_BYTES = 300 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Crop `croppedAreaPixels` from the image at `imageSourceUrl`, resize to 512×512,
 * encode as JPEG. Re-encoding strips EXIF. Targets ≤ ~300KB.
 */
export async function exportCroppedImageToJpegBlob(
  imageSourceUrl: string,
  croppedAreaPixels: Area,
): Promise<Blob> {
  const img = await loadImage(imageSourceUrl);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    const { x, y, width, height } = croppedAreaPixels;
    ctx.drawImage(img, x, y, width, height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    let quality = 0.82;
    let blob: Blob | null = null;
    for (let i = 0; i < 22; i++) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!blob) throw new Error("Could not encode image");
      if (blob.size <= MAX_BYTES || quality <= 0.42) break;
      quality -= 0.03;
    }
    if (!blob) throw new Error("Could not encode image");
    return blob;
  } finally {
    img.removeAttribute("src");
  }
}
