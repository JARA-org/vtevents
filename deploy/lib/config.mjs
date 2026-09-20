/** Operator-only, pure validation of raw production env text and hostname.
 * Returns parsed values/errors; no I/O, authorization changes, retries or transaction.
 * Errors identify fields only, never their values. Repeated calls are equivalent.
 */
export function checkProductionConfig(text, domain) {
  const errors = [];
  const values = {};
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(values, match[1])) {
      errors.push(`Line ${index + 1}: expected a unique NAME=value entry.`);
      continue;
    }
    const [, key, value] = match;
    values[key] = value;
    if (
      value !== value.trim() ||
      /^["']|["']$/.test(value) ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      errors.push(
        `${key}: use an unquoted single-line value without surrounding whitespace.`,
      );
    if (/^EXPO_PUBLIC_/.test(key))
      errors.push(
        `${key}: frontend environment variables are not allowed here.`,
      );
    if (value && /GENERATE_|SAFE_PLACEHOLDER|YOUR_|CHANGE_ME/i.test(value))
      errors.push(`${key}: replace the example placeholder.`);
  }
  if (
    !domain ||
    domain.length > 253 ||
    !domain.includes(".") ||
    !domain
      .split(".")
      .every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
      ) ||
    /(?:^|\.)(?:localhost|local|test|invalid|example)$|^\d+(?:\.\d+){3}$/i.test(
      domain,
    )
  )
    errors.push(
      "GOBBLER_DOMAIN: supply an owned public DNS hostname, without scheme, port or path.",
    );
  if (values.APP_ORIGIN && values.APP_ORIGIN !== `https://${domain}`)
    errors.push(
      "APP_ORIGIN: must match the HTTPS GOBBLER_DOMAIN used by Compose.",
    );
  if (values.NODE_ENV && values.NODE_ENV !== "production")
    errors.push("NODE_ENV: must be production if specified.");
  if (values.PORT && values.PORT !== "3000")
    errors.push("PORT: must be 3000 if specified.");
  if (!/^[a-zA-Z0-9_-]+$/.test(values.MONGODB_DB || ""))
    errors.push("MONGODB_DB: specify the application database name.");
  try {
    const uri = new URL(values.MONGODB_URI);
    if (
      uri.protocol !== "mongodb+srv:" ||
      !uri.username ||
      !uri.password ||
      !uri.hostname.endsWith(".mongodb.net") ||
      uri.port ||
      [...uri.searchParams].some(
        ([key, value]) =>
          (/^(tls|ssl)$/i.test(key) && value !== "true") ||
          /^(tlsInsecure|tlsAllowInvalidCertificates|tlsAllowInvalidHostnames)$/i.test(
            key,
          ),
      )
    )
      throw new Error();
  } catch {
    errors.push(
      "MONGODB_URI: use an authenticated Atlas SRV URI with TLS verification enabled.",
    );
  }
  const secrets = [
    "BETTER_AUTH_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "ANALYTICS_SALT",
    "JOB_SECRET",
  ];
  for (const key of secrets) {
    const value = values[key] || "";
    if (
      key === "TOKEN_ENCRYPTION_KEY"
        ? !/^[a-f0-9]{64}$/i.test(value)
        : value.length < 32
    )
      errors.push(
        `${key}: ${key === "TOKEN_ENCRYPTION_KEY" ? "must contain exactly 64 hexadecimal characters" : "must contain at least 32 characters"}.`,
      );
    if (
      value &&
      secrets.some((other) => other !== key && values[other] === value)
    )
      errors.push(`${key}: use an independent secret.`);
  }
  for (const pair of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["RESEND_API_KEY", "AUTH_EMAIL_FROM"],
    ["CANVAS_CLIENT_ID", "CANVAS_CLIENT_SECRET"],
    ["DISCORD_CLIENT_ID", "DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN"],
    ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"],
    ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_WAREHOUSE_ID"],
  ]) {
    if (pair.some((key) => values[key]) && !pair.every((key) => values[key]))
      errors.push(
        `${pair.join(" / ")}: configure the complete integration or leave it empty.`,
      );
  }
  if (values.DISCORD_CLIENT_SECRET)
    errors.push(
      "DISCORD_CLIENT_SECRET: retired user OAuth is unsupported; remove this credential.",
    );
  if (values.DISCORD_CLIENT_ID && !/^\d{1,20}$/.test(values.DISCORD_CLIENT_ID))
    errors.push("DISCORD_CLIENT_ID: must be the Discord application ID.");
  if (
    values.DISCORD_PUBLIC_KEY &&
    !/^[a-f0-9]{64}$/i.test(values.DISCORD_PUBLIC_KEY)
  )
    errors.push(
      "DISCORD_PUBLIC_KEY: must contain exactly 64 hexadecimal characters.",
    );
  for (const flag of ["DISCORD_COLLECTION_ENABLED", "DISCORD_AI_ENABLED"]) {
    if (values[flag] && !["true", "false"].includes(values[flag]))
      errors.push(`${flag}: must be true or false.`);
    if (
      values[flag] === "true" &&
      !["DISCORD_CLIENT_ID", "DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN"].every(
        (key) => values[key],
      )
    )
      errors.push(`${flag}: requires complete bot configuration.`);
  }
  if (
    values.DISCORD_AI_ENABLED === "true" &&
    (values.DISCORD_COLLECTION_ENABLED !== "true" || !values.GEMINI_API_KEY)
  )
    errors.push(
      "DISCORD_AI_ENABLED: requires enabled collection and backend Gemini credentials.",
    );
  for (const [key, maximum] of [
    ["DISCORD_AI_GUILD_DAILY_LIMIT", 20],
    ["DISCORD_AI_GUILD_HOURLY_LIMIT", 5],
  ]) {
    if (
      values[key] &&
      (!/^\d+$/.test(values[key]) || Number(values[key]) > maximum)
    )
      errors.push(`${key}: must be an integer from 0 to ${maximum}.`);
  }
  return { values, errors };
}
