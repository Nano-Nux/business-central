# Mobile local development and release notes

```powershell
flutter pub get
dart run build_runner build
dart format lib test
flutter analyze
flutter test
```

Copy `.env.example` to `.env` without committing secrets. Android emulators
reach a backend on the development computer through `10.0.2.2`; physical
devices need a reachable LAN/HTTPS URL. Production ONLINE builds must use
HTTPS. A `FULLY_OFFLINE` build must omit backend access for the entire session.

Before a release, run the relevant platform build and verify secure storage,
SQLite migrations, local backup/recovery, accessibility, and the no-network
fully-offline integration tests on the target platform.
