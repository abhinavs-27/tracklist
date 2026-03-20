# Tracklist mobile (Expo)

## API (`EXPO_PUBLIC_API_URL`)

All API calls use **`EXPO_PUBLIC_API_URL`** + `/api/...` (see `lib/api.ts`). Point this at the **Express backend** in `../backend/` (default **`http://<LAN-IP>:3001`**), not the Next.js UI on **3000**.

Example `mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
```

Start **`backend`** before Expo. Use your machine’s LAN IP for a physical device (same Wi‑Fi).

---

## Commands

npx expo run:ios

# kill everything

pkill -f expo
pkill -f node

# clean

rm -rf node_modules
rm -rf .expo
rm package-lock.json

npm install

# restart clean

npx expo start -c
npx expo run:ios
