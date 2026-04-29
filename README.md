# Termira

Termira is a macOS-first desktop SSH client built as an Electron + React + TypeScript app with a Java sidecar backend.

## Stage 0 Baseline

This repository currently contains the phase 0 engineering baseline:

- `apps/desktop`: Electron main/preload plus React renderer.
- `apps/backend-java`: Maven Java sidecar with stdio JSON-RPC.
- `packages/shared`: shared TypeScript IPC/domain contracts.
- `docs`: product, architecture, development, security, testing, and phase notes.

## Commands

```bash
npm install
npm run dev
npm run test
npm run build
```

Java-only commands:

```bash
mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml test
mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml exec:java
```
