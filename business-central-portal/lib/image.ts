export const MAX_IMAGE_SIZE = 240;
export const MAX_IMAGE_UPLOAD_BYTES = 500 * 1024;

export function fitImageDimensions(width: number, height: number, maxSize = MAX_IMAGE_SIZE) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectURL = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectURL);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error("The selected file is not a valid image."));
    };
    image.src = objectURL;
  });
}

async function resizedCanvas(file: File, maxSize: number) {
  const image = await loadImage(file);
  const dimensions = fitImageDimensions(image.width, image.height, maxSize);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to resize image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function resizeImage(file: File, maxSize = MAX_IMAGE_SIZE): Promise<string> {
  return resizedCanvas(file, maxSize).then((canvas) => canvas.toDataURL("image/jpeg", 0.82));
}

export async function resizeImageFile(file: File, maxSize = MAX_IMAGE_SIZE): Promise<File> {
  const canvas = await resizedCanvas(file, maxSize);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Unable to encode image."))),
      "image/png",
    );
  });
  if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("The resized image is larger than 500 KB.");
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.png`, {
    type: "image/png",
    lastModified: file.lastModified,
  });
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
