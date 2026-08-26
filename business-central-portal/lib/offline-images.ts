export const PORTAL_IMAGE_UPLOADS = "portal_image_uploads";
export const PORTAL_IMAGE_UPLOAD_MARKER = "__portal_image_upload_id";

export type OfflineImageUpload = {
  id: string;
  filename: string;
  content_type: string;
  data_base64: string;
};

export function imageUploadMarker(id: string) {
  return { [PORTAL_IMAGE_UPLOAD_MARKER]: id };
}

export function imageUploadID(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>)[PORTAL_IMAGE_UPLOAD_MARKER];
  return typeof id === "string" && id ? id : null;
}
