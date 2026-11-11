# Seif Study OS Mobile

Native Expo/React Native Android client for Seif Study OS.

## Shared data architecture

This app does not create a second database. It authenticates against the existing private owner endpoint and calls the existing `/api/trpc` procedures with a short-lived Bearer session. The web client continues to use its signed HTTP-only cookie session. Both clients resolve to the same MySQL/TiDB records and S3-backed files.

## Local development

```bash
cd mobile
pnpm install
EXPO_PUBLIC_API_BASE_URL=https://seifstudy-ufsrnaxx.manus.space pnpm start
```

For a local backend, use `EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_IP:3000` from a physical Android device; `localhost` points to the device itself.

## Current native foundation

- Private single-account sign-in with secure device storage.
- Shared dashboard metrics and Coins.
- Shared task list, task creation, and completion rewards.
- Native 45-minute focus / 15-minute break timer.
- Study Video safe external launcher with the same server session tracking.
- Seify assistant request screen connected to the existing assistant router.
- RTL Arabic-first navigation and mobile-safe layouts.

The remaining web feature screens are designed to be added as native routes while reusing the same typed tRPC procedures; no migration or second database is required.
