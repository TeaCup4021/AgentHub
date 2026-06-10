const SECRET_ASSIGNMENT_RE =
  /((?:api\s*key|apikey|api_key|secret|token|access[_\s-]*token|authorization|密钥|令牌)\s*(?:is|是|为|=|:|：)\s*)(["'“”‘’]?)([^\s,，;；\n"'“”‘’]+)/gi;

const STANDALONE_SECRET_RE = /\bsk-[A-Za-z0-9_-]{12,}\b/g;

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) return "****";
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
}

export function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text
    .replace(SECRET_ASSIGNMENT_RE, (_match, label: string, quote: string, value: string) => (
      `${label}${quote}${maskSecret(value)}`
    ))
    .replace(STANDALONE_SECRET_RE, (value) => maskSecret(value));
}
