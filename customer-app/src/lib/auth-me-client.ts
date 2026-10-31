/** Share one in-flight /api/auth/me across Shell and the page that just mounted. */
let inflight: Promise<Response> | null = null;

export function fetchAuthMe() {
  if (!inflight) {
    inflight = fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    }).finally(() => {
      inflight = null;
    });
  }
  return inflight.then((res) => res.clone());
}
