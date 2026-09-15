/**
 * Node ESM loader that redirects Bedrock engine imports to in-memory mocks,
 * so the add-on scripts run headlessly in the simulation tests.
 * Usage: node --loader ./loader.mjs run-sim.mjs
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@minecraft/server")
    return nextResolve(new URL("./mock-server.mjs", import.meta.url).href, context);
  if (specifier === "@minecraft/server-ui")
    return nextResolve(new URL("./mock-ui.mjs", import.meta.url).href, context);
  return nextResolve(specifier, context);
}
