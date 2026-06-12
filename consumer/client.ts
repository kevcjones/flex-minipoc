import { Output, routes, Routes } from "./router";

/**
 * A typed client over the front door. The return type is inferred from the
 * route's output contract (build-time safety), and the response is validated
 * against that contract on receive (consumer-side drift detection): a
 * pass-through with no compute of its own is still checked here.
 */
const BASE = process.env.FLEX_BASE_URL ?? "https://app.example";

export async function call<K extends keyof Routes>(
  key: K,
  userId: string,
): Promise<Output<K>> {
  const [method, path] = key.split(" ");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-user-id": userId },
  });
  const raw = await res.json();

  const parsed = routes[key].output.safeParse(raw);
  if (!parsed.success) {
    console.warn(`DRIFT ${key}`, JSON.stringify(parsed.error.issues));
  }

  return raw as Output<K>;
}
