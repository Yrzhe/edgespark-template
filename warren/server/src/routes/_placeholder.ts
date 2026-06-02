import { Hono } from "hono";

export function createPlaceholderRoutes(group: string): Hono {
  const routes = new Hono();

  routes.get(`/_w1/${group}`, (c) =>
    c.json(
      {
        ok: true,
        group,
        message: "Warren W-1 scaffold route group is mounted; full behavior lands in W-2 through W-10.",
      }
    )
  );

  return routes;
}
