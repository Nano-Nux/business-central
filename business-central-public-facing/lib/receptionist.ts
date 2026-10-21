export type Slot = { start: string; end: string };
export type Message = {
  id: string;
  role: string;
  content: string;
  slots?: Slot[];
  created_at: string;
};
export type Booking = {
  id: string;
  conversation_id: string;
  name: string;
  email: string;
  company: string;
  notes: string;
  start: string;
  end: string;
  timezone: string;
  status: string;
  event_url: string;
  last_error: string;
};
export type Conversation = {
  id: string;
  messages: Message[];
  bookings: Booking[];
};
export type ChatSession = { id: string; token: string };
export type BookingRequest = {
  request_id: string;
  name: string;
  email: string;
  company: string;
  notes: string;
  start: string;
  confirmed: boolean;
};
export class ReceptionistError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Keep model replies readable as text, including older replies with Markdown or
// escaped entities. React still escapes the result; never interpret it as HTML.
export function receptionistText(content: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return content
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, code: string) => {
        if (!code.startsWith("#"))
          return entities[code.toLowerCase()] || entity;
        const value =
          code[1].toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return value > 0 &&
          value <= 0x10ffff &&
          !(value >= 0xd800 && value <= 0xdfff)
          ? String.fromCodePoint(value)
          : entity;
      },
    )
    .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}
const raw = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");
const base = `${raw.endsWith("/api/v1") ? raw : `${raw}/api/v1`}/public/receptionist`;
export async function receptionistRequest<T>(
  path: string,
  session?: ChatSession,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(100_000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ReceptionistError(
      value?.error?.code || "REQUEST_FAILED",
      value?.error?.message ||
        "Reception is temporarily unavailable. Please try again shortly.",
    );
  return value.data as T;
}
