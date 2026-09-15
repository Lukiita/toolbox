// Public API of @lukiita/toolbox: the config contract and the gate as a
// function. The CLI, the pre-push decision and the installer are reachable
// through `toolbox <command>`, not as exports - what is exported here is
// SemVer-load-bearing across every consumer (ADR-0001).
export * from "./config/index.mjs";
export { runQualityGate } from "./quality-gate/run-gate.mjs";
