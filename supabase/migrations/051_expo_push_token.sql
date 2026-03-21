-- Store Expo push token per user (mobile). Nullable; updated on each app launch / login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
