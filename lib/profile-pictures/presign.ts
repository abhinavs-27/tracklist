import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { awsRegionForS3, profilePicturesBucket } from "@/lib/profile-pictures/config";
import { PROFILE_PICTURE_PUT_CONTENT_TYPE } from "@/lib/profile-pictures/upload-content-type";

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!client) {
    const region = awsRegionForS3();
    // Use dedicated S3 credentials when set (allows a separate IAM user for image uploads
    // vs the main AWS_ACCESS_KEY_ID used for SQS/Lambda).
    const s3AccessKeyId =
      process.env.AWS_S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
    const s3SecretAccessKey =
      process.env.AWS_S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
    client = new S3Client({
      region,
      ...(s3AccessKeyId && s3SecretAccessKey
        ? { credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey } }
        : {}),
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    console.log("[profile-pictures] S3Client initialized", { region });
  }
  return client;
}

/** Presigned URL lifetime (seconds). >= 60; larger reduces clock-skew / slow clients failing before PUT. */
const PRESIGN_EXPIRES_SECONDS = 300;

/**
 * Presigned PUT.
 * Only Bucket, Key, ContentType — browser must send the same Content-Type on PUT.
 *
 * Bucket CORS (example): AllowedMethods PUT,GET,HEAD; AllowedHeaders ["*"];
 * AllowedOrigins http://127.0.0.1:3000, http://localhost:3000, https://tracklistsocial.com
 */
export async function presignProfilePicturePut(key: string): Promise<string> {
  const bucket = profilePicturesBucket();
  if (!bucket) {
    throw new Error("PROFILE_PICTURES_S3_BUCKET is not set");
  }

  const region = awsRegionForS3();
  const contentType = PROFILE_PICTURE_PUT_CONTENT_TYPE;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });

  let endpointHost = "";
  let pathname = "";
  try {
    const u = new URL(presignedUrl);
    endpointHost = u.host;
    pathname = u.pathname;
  } catch {
    /* ignore parse errors */
  }

  const debugFullUrl =
    process.env.NODE_ENV === "development" ||
    process.env.PROFILE_PICTURES_PRESIGN_DEBUG === "1";

  console.log("[profile-pictures] presign PutObject", {
    s3ClientRegion: region,
    bucket,
    key,
    contentTypeSigned: contentType,
    expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
    presignedEndpointHost: endpointHost,
    presignedPath: pathname,
    ...(debugFullUrl
      ? { presignedUrl }
      : {
          note: "Set PROFILE_PICTURES_PRESIGN_DEBUG=1 (or NODE_ENV=development) to log full presignedUrl",
        }),
  });

  return presignedUrl;
}

/**
 * Presigned GET for private bucket; `/api/profile-pictures/...` redirects here.
 * IAM: credentials used for signing must include **s3:GetObject** on
 * `arn:aws:s3:::BUCKET/profile_pictures/*` (same as PutObject).
 */
const PRESIGN_GET_EXPIRES_SECONDS = 3600;

export async function presignProfilePictureGet(
  key: string,
  expiresInSeconds: number = PRESIGN_GET_EXPIRES_SECONDS,
): Promise<string> {
  const bucket = profilePicturesBucket();
  if (!bucket) {
    throw new Error("PROFILE_PICTURES_S3_BUCKET is not set");
  }

  const region = awsRegionForS3();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });

  const debug =
    process.env.NODE_ENV === "development" ||
    process.env.PROFILE_PICTURES_PRESIGN_DEBUG === "1";
  if (debug) {
    console.log("[profile-pictures] presign GetObject", {
      s3ClientRegion: region,
      bucket,
      key,
      expiresInSeconds,
      presignedGetUrlPrefix: url.slice(0, 100),
    });
  }

  return url;
}
