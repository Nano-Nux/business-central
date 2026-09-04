"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { upload } from "@/lib/api";
import { blobToBase64, resizeImageFile } from "@/lib/image";
import { resolveMediaURL } from "@/lib/media-url";
import { randomUuid } from "@/lib/random-uuid";
import type { OfflineImageUpload } from "@/lib/offline-images";
import { Field } from "./ui";

export type ImageAction = "KEEP" | "REMOVE" | "URL" | "GOOGLE_DRIVE" | "UPLOAD";

export type ImageSubmission = {
  image_url: string;
  source_type: "URL" | "GOOGLE_DRIVE" | "UPLOAD";
  filename: string;
  content_type: string;
  offline_upload?: OfflineImageUpload;
};

export type ImagePreparationOptions = {
  deferUploads?: boolean;
};

export function ImageSourceField({
  name = "image",
  label = "Image",
  currentUrl,
  multiple = false,
  disabled = false,
  emptyMessage = "No saved image yet.",
}: {
  name?: string;
  label?: string;
  currentUrl?: string;
  multiple?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [action, setAction] = useState<ImageAction>("KEEP");
  const [selectedPreview, setSelectedPreview] = useState("");
  const [prevUrl, setPrevUrl] = useState(currentUrl);

  if (currentUrl !== prevUrl) {
    setPrevUrl(currentUrl);
    setSelectedPreview("");
    setAction("KEEP");
  }

  useEffect(() => {
    return () => {
      if (selectedPreview.startsWith("blob:")) URL.revokeObjectURL(selectedPreview);
    };
  }, [selectedPreview]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedPreview("");
      return;
    }
    setAction("UPLOAD");
    setSelectedPreview(URL.createObjectURL(file));
  }
  return (
    <div className="wide">
      <Field label={label}>
        {(currentUrl || selectedPreview) && (
          <div className="image-preview-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPreview || resolveMediaURL(currentUrl)}
              alt={selectedPreview ? "Selected image preview" : "Saved image"}
            />
            <div className="image-preview-meta">
              <small>{selectedPreview ? "Selected image - save to upload" : "Saved image"}</small>
              {currentUrl && action !== "UPLOAD" && (
                <button
                  type="button"
                  className="button secondary mini-button"
                  disabled={disabled}
                  onClick={() => setAction("UPLOAD")}
                >
                  Upload new image
                </button>
              )}
            </div>
          </div>
        )}
        <select
          name={`${name}_action`}
          value={action}
          disabled={disabled}
          onChange={(event) => setAction(event.target.value as ImageAction)}
        >
          <option value="KEEP">{currentUrl ? "Keep current image" : "No image"}</option>
          {currentUrl && <option value="REMOVE">Remove image</option>}
          <option value="URL">Image URL</option>
          <option value="GOOGLE_DRIVE">Google Drive image URL</option>
          <option value="UPLOAD">Upload image</option>
        </select>
        {(action === "URL" || action === "GOOGLE_DRIVE") && (
          <input
            name={`${name}_url`}
            type="url"
            required
            disabled={disabled}
            placeholder={
              action === "GOOGLE_DRIVE"
                ? "https://drive.google.com/file/d/.../view"
                : "https://example.com/image.jpg"
            }
          />
        )}
        {action === "UPLOAD" && (
          <input
            name={`${name}_file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
            multiple={multiple}
            disabled={disabled}
            onChange={selectFile}
          />
        )}
        {!currentUrl && !selectedPreview && <small>{emptyMessage}</small>}
        <small>
          Direct uploads are resized to fit within 240×240px and submitted as PNG (500 KB max).
        </small>
      </Field>
    </div>
  );
}

export function imageAction(values: FormData, name = "image") {
  return String(values.get(`${name}_action`) ?? "KEEP") as ImageAction;
}

export async function prepareImageSubmissions(
  values: FormData,
  name = "image",
  options: ImagePreparationOptions = {},
): Promise<ImageSubmission[]> {
  const action = imageAction(values, name);
  if (action === "KEEP" || action === "REMOVE") return [];
  if (action === "URL" || action === "GOOGLE_DRIVE") {
    const imageURL = String(values.get(`${name}_url`) ?? "").trim();
    if (!imageURL) throw new Error("Enter an image URL.");
    return [
      {
        image_url: imageURL,
        source_type: action,
        filename: "linked-image",
        content_type: "image/*",
      } satisfies ImageSubmission,
    ];
  }

  const files = values
    .getAll(`${name}_file`)
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) throw new Error("Select an image to upload.");
  return Promise.all(
    files.map(async (file) => {
      const resized = await resizeImageFile(file);
      if (options.deferUploads) {
        const offlineUpload: OfflineImageUpload = {
          id: randomUuid(),
          filename: resized.name,
          content_type: resized.type,
          data_base64: await blobToBase64(resized),
        };
        return {
          image_url: "",
          source_type: "UPLOAD",
          filename: resized.name,
          content_type: resized.type,
          offline_upload: offlineUpload,
        } satisfies ImageSubmission;
      }
      const data = new FormData();
      data.set("file", resized);
      const stored = await upload<{ image_url: string; source_type: "UPLOAD" }>(
        "/media/images/upload",
        data,
      );
      return {
        ...stored,
        filename: resized.name,
        content_type: resized.type,
      } satisfies ImageSubmission;
    }),
  );
}
