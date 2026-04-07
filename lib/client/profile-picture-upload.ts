"use client";

import { PROFILE_PICTURE_PUT_CONTENT_TYPE } from "@/lib/profile-pictures/upload-content-type";

export type ProfilePictureTarget =
  | { type: "user"; id: string }
  | { type: "community"; id: string };

/**
 * Presigned PUT to S3 then persist URL via `/api/profile-picture`.
 */
export async function uploadProfilePictureJPEG(
  blob: Blob,
  target: ProfilePictureTarget,
): Promise<{ file_url: string }> {
  const urlRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: target.type, id: target.id }),
  });
  const urlJson = (await urlRes.json().catch(() => ({}))) as {
    error?: string;
    upload_url?: string;
    file_url?: string;
  };
  if (!urlRes.ok) {
    throw new Error(urlJson.error ?? "Could not get upload URL");
  }
  const { upload_url, file_url } = urlJson;
  if (!upload_url || !file_url) {
    throw new Error("Invalid upload URL response");
  }

  /** Only header allowed — must match server `PutObjectCommand.ContentType` exactly. */
  const putHeaders: Record<string, string> = {
    "Content-Type": PROFILE_PICTURE_PUT_CONTENT_TYPE,
  };

  let presignedHost = "";
  let presignedPath = "";
  try {
    const u = new URL(upload_url);
    presignedHost = u.host;
    presignedPath = u.pathname;
  } catch {
    /* ignore */
  }

  console.log("[profile-pictures] browser PUT to S3", {
    pageOrigin: typeof window !== "undefined" ? window.location.origin : "",
    presignedHost,
    presignedPath,
    contentType: putHeaders["Content-Type"],
    blobType: blob.type || "(empty)",
    bodyBytes: blob.size,
    headersUsedForPut: { ...putHeaders },
  });

  const put = await fetch(upload_url, {
    method: "PUT",
    body: blob,
    headers: putHeaders,
  });

  if (!put.ok) {
    const responseBody = await put.text();
    console.error("[profile-pictures] S3 PUT failed", {
      httpStatus: put.status,
      statusText: put.statusText,
      responseHeaders: Object.fromEntries(put.headers.entries()),
      responseBody,
      signedContentType: PROFILE_PICTURE_PUT_CONTENT_TYPE,
      diagnosisHint:
        put.status === 403
          ? "403: often SignatureDoesNotMatch (Content-Type/body vs presign), AccessDenied (IAM/bucket policy/KMS), or wrong region in URL vs bucket."
          : undefined,
    });
    throw new Error(
      `Upload to storage failed (${put.status}): ${responseBody.slice(0, 800)}`,
    );
  }

  const save = await fetch("/api/profile-picture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: target.type,
      id: target.id,
      file_url,
    }),
  });
  const saveJson = (await save.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!save.ok) {
    throw new Error(saveJson.error ?? "Could not save profile picture");
  }

  // `file_url` is a stable app URL (`…/api/profile-pictures/user|community/…`); <img src> loads
  // via 302 to a presigned S3 GET — not the raw S3 or PUT URL.
  if (process.env.NODE_ENV === "development") {
    console.log("[profile-pictures] saved display URL for <img src>", file_url);
  }

  return { file_url };
}
