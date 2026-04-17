// Canonical exit codes for the `devicesdk` CLI.
//
// These values are part of the public CLI contract — scripts and CI pipelines
// may dispatch on them. Do NOT renumber. New categories get a new value.
//
// Categories reflect how each class of failure should be handled by callers:
//   SUCCESS           — everything worked
//   GENERIC           — unclassified error; treat as "try again or file a bug"
//   CONFIG_INVALID    — bad template, unknown/missing device, or otherwise invalid CLI argument
//   NOT_AUTHENTICATED — no valid credentials; prompt `devicesdk login`
//   CONFIG_LOAD_FAILED — devicesdk.ts is missing, unparseable, or semantically wrong
//   BUILD_ERROR       — esbuild bundling failed; user's device script has errors
//   DEPLOY_ERROR      — upload / flash / device-communication failure
export const EXIT = {
	SUCCESS: 0,
	GENERIC: 1,
	CONFIG_INVALID: 2,
	NOT_AUTHENTICATED: 3,
	CONFIG_LOAD_FAILED: 4,
	BUILD_ERROR: 5,
	DEPLOY_ERROR: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
