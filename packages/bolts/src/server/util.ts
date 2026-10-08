import type { Context } from "hono";

export function err(c: Context, status: number, message: string) {
  return c.json({ error: message }, status as 400);
}

export async function body<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}
