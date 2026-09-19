import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
} from "node:crypto";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function key() {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k || !/^[a-f0-9]{64}$/i.test(k))
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex");
  return Buffer.from(k, "hex");
}
export function seal(data: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T = any>(value: string): T {
  const [iv, tag, cipher] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([d.update(cipher), d.final()]).toString("utf8"),
  );
}
export function pseudonym(userId: string) {
  return createHmac(
    "sha256",
    process.env.ANALYTICS_SALT ||
      process.env.BETTER_AUTH_SECRET ||
      "local-demo",
  )
    .update(userId)
    .digest("hex");
}
