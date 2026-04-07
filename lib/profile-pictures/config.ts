import "server-only";

/** S3 object key for a JPEG profile picture (fixed path → overwrite on re-upload). */
export function profilePictureObjectKey(
  type: "user" | "community",
  id: string,
): string {
  return type === "user"
    ? `profile_pictures/users/${id}.jpg`
    : `profile_pictures/communities/${id}.jpg`;
}

/**
 * Public GET URL for an object key. Set `NEXT_PUBLIC_PROFILE_PICTURES_BASE_URL`
 * to your CloudFront or public bucket origin (no trailing slash), e.g.
 * `https://d111111abcdef8.cloudfront.net`.
 */
export function getProfilePicturesPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PROFILE_PICTURES_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const bucket = process.env.PROFILE_PICTURES_S3_BUCKET?.trim();
  if (!bucket) return "";
  const region = awsRegionForS3();
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

export function profilePicturesBucket(): string | null {
  const b = process.env.PROFILE_PICTURES_S3_BUCKET?.trim();
  return b || null;
}

/** Bucket + resolvable public base URL (CDN or S3 virtual-hosted style). */
export function isProfilePictureUploadConfigured(): boolean {
  if (!profilePicturesBucket()) return false;
  return Boolean(getProfilePicturesPublicBaseUrl());
}

export function publicUrlForProfilePictureKey(key: string): string {
  const base = getProfilePicturesPublicBaseUrl();
  if (!base) return "";
  const k = key.replace(/^\//, "");
  return `${base}/${k}`;
}

/**
 * Region for the profile-pictures bucket (presign + virtual-hosted public URLs).
 * Defaults to **us-east-2** — does not follow `AWS_REGION`, so a global `AWS_REGION=us-east-1`
 * (e.g. for other SDKs) cannot break Ohio S3 signing.
 * Override: `PROFILE_PICTURES_S3_REGION=us-east-2` (or another region if the bucket moves).
 */
export function awsRegionForS3(): string {
  return process.env.PROFILE_PICTURES_S3_REGION?.trim() || "us-east-2";
}
