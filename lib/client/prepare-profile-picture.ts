/**
 * Client-only: resize/crop to 512×512 cover and encode JPEG, targeting ≤ ~300KB.
 */
export async function prepareProfilePictureFile(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    const scale = Math.max(size / bmp.width, size / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(bmp, x, y, w, h);

    const maxBytes = 300 * 1024;
    let quality = 0.92;
    let blob: Blob | null = null;

    for (let i = 0; i < 16; i++) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!blob) throw new Error("Could not encode image");
      if (blob.size <= maxBytes || quality <= 0.48) break;
      quality -= 0.04;
    }

    if (!blob) throw new Error("Could not encode image");
    return blob;
  } finally {
    bmp.close();
  }
}
