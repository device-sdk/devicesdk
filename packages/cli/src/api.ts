// Re-export shim. The implementation lives in ./api/ - see api/index.ts for
// the module map. Existing imports `from "../api.js"` keep working unchanged.
export * from "./api/index.js";
