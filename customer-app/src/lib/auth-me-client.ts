/** Share one in-flight /api/auth/me across Shell and the page that just mounted. */
let inflight: Promise<Response> | null = null;

export function fetchAuthMe(opts?: { fresh?: boolean }) {
  if (opts?.fresh) {
    return fetch("/api/auth/me?fresh=1", {
      cache: "no-store",
      credentials: "same-origin",
    });
  }
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
