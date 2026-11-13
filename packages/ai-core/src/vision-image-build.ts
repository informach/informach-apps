/** Next's native tracer includes Sharp's addon but can omit its sibling DLLs.
 * Include installed @img runtime libraries explicitly for pnpm standalone builds.
 * workspacePath is relative to the Next app directory, as required by Next tracing.
 */
export function visionImageTracingIncludes(workspacePath: string) {
  return {
    "/*": [
      `${workspacePath.replaceAll("\\", "/")}/node_modules/.pnpm/@img+sharp-*/node_modules/@img/sharp-*/lib/**/*`,
    ],
  };
}
