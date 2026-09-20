import "dotenv/config";
export const config = {
  port: Number(process.env.PORT || 3000),
  // Browsers send an Origin header with no trailing slash, and this value is
  // compared to it exactly. A configured "http://host/" would otherwise reject
  // every state-changing request with no hint as to why, so normalize it once
  // here. It is also the auth base URL and the base for generated links, where
  // the trailing slash is equally unwanted.
  origin: (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/+$/, ""),
  mongo: process.env.MONGODB_URI,
  db: process.env.MONGODB_DB || "my_little_gobbler",
  production: process.env.NODE_ENV === "production",
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function remote(url: string, init: RequestInit = {}) {
  const retries = !init.method || init.method === "GET" ? 2 : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) continue;
        throw new HttpError(
          res.status === 401 || res.status === 403 ? 409 : 502,
          res.status === 401 || res.status === 403
            ? "The source is not available right now. Please try again later."
            : "The source could not be reached. Please try again.",
        );
      }
      return res;
    } catch (error) {
      if (attempt >= retries || error instanceof HttpError) throw error;
    }
  }
}
