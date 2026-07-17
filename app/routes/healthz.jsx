/**
 * Unauthenticated health check for Render / load balancers.
 * Do not put auth here — probes must get a fast 200.
 */
export const loader = async () => {
  return Response.json(
    { ok: true, service: "calicodesk-shopify" },
    { status: 200 },
  );
};
