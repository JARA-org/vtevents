import "dotenv/config";
export const config = {
  port: Number(process.env.PORT || 3000),
  origin: process.env.APP_ORIGIN || "http://localhost:3000",
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
            ? "Connection expired or permission unavailable. Reconnect to continue."
            : "The source could not be reached. Please try again.",
        );
      }
      return res;
    } catch (error) {
      if (attempt >= retries || error instanceof HttpError) throw error;
    }
  }
}
