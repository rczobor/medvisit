// The Convex runtime exposes deployment environment variables as
// `process.env` and nothing else from Node's `process`. Declared here instead
// of pulling in all of @types/node, which would hide accidental Node API use.
declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>
}
