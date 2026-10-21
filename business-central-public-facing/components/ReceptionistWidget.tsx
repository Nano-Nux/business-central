"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, MessageCircle, Send, X } from "lucide-react";
import {
  BookingRequest,
  ChatSession,
  Conversation,
  ReceptionistError,
  Slot,
  receptionistText,
  receptionistRequest,
} from "@/lib/receptionist";

const sessionKey = "nanonux_receptionist_session";
const pendingKey = (id: string) => `nanonux_receptionist_booking_${id}`;
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50";
const buttonClass =
  "rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-slate-700";
function displayTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function SlotOptions({
  slots,
  timezone,
  disabled,
  onChoose,
}: {
  slots: Slot[];
  timezone: string;
  disabled: boolean;
  onChoose: (slot: Slot) => void;
}) {
  const days = new Map<string, Slot[]>();
  for (const slot of slots) {
    const day = dateInTimezone(slot.start, timezone);
    const group = days.get(day) || [];
    if (!group.some((item) => item.start === slot.start)) group.push(slot);
    days.set(day, group);
  }
  const time = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  return (
    <div className="mt-3 space-y-3" aria-label="Available appointment times">
      <p className="text-xs text-slate-500">Times in {timezone}</p>
      {[...days].map(([day, options]) => (
        <div key={day}>
          <p className="mb-2 text-xs font-medium">
            {new Intl.DateTimeFormat(undefined, {
              timeZone: timezone,
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date(options[0].start))}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((slot) => (
              <button
                key={slot.start}
                type="button"
                disabled={disabled}
                onClick={() => onChoose(slot)}
                aria-label={`${displayTime(slot.start, timezone)} to ${time(slot.end)}`}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800 hover:border-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              >
                {time(slot.start)} – {time(slot.end)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReceptionistWidget({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [optimisticMessageId, setOptimisticMessageId] = useState<string | null>(
    null,
  );
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [checkedDate, setCheckedDate] = useState("");
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [details, setDetails] = useState({
    name: "",
    email: "",
    company: "",
    notes: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<BookingRequest | null>(null);
  const [staleOffers, setStaleOffers] = useState<string[]>([]);
  const loading = useRef<Promise<void> | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const bookingPanel = useRef<HTMLDivElement>(null);
  const shown = open || isOpen;
  const showBooking = bookingMode || isOpen;
  const activeBooking = conversation?.bookings?.find(
    (b) => b.status === "CONFIRMED" || b.status === "PENDING",
  );
  const latestOffer = conversation?.messages.findLast(
    (item) => item.role === "assistant",
  );

  const initialize = useCallback(() => {
    if (loading.current) return loading.current;
    loading.current = (async () => {
      const status = await receptionistRequest<{
        enabled: boolean;
        timezone: string;
        calendar_connected: boolean;
      }>("/status");
      setTimezone(status.timezone);
      setConnected(status.calendar_connected);
      if (!status.enabled)
        throw new Error(
          "Online reception is currently unavailable. Please contact the Nanonux team directly.",
        );
      let saved: ChatSession | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      } catch {
        sessionStorage.removeItem(sessionKey);
      }
      if (saved?.id && saved?.token) {
        try {
          const c = await receptionistRequest<Conversation>(
            `/conversations/${saved.id}`,
            saved,
          );
          setSession(saved);
          setConversation(c);
          const existing = c.bookings?.find((b) => b.status === "PENDING");
          if (existing)
            setPending({
              request_id: existing.id,
              name: existing.name,
              email: existing.email,
              company: existing.company,
              notes: existing.notes,
              start: existing.start,
              confirmed: true,
            });
          else if (c.bookings?.some((b) => b.status === "CONFIRMED"))
            sessionStorage.removeItem(pendingKey(saved.id));
          else {
            try {
              const request = JSON.parse(
                sessionStorage.getItem(pendingKey(saved.id)) || "null",
              ) as BookingRequest | null;
              if (request?.request_id) setPending(request);
            } catch {
              sessionStorage.removeItem(pendingKey(saved.id));
            }
          }
          return;
        } catch (e) {
          if (!(e instanceof ReceptionistError) || e.code !== "NOT_FOUND")
            throw e;
          sessionStorage.removeItem(sessionKey);
        }
      }
      const started = await receptionistRequest<{
        conversation: Conversation;
        token: string;
      }>("/conversations", undefined, {});
      const next = { id: started.conversation.id, token: started.token };
      sessionStorage.setItem(sessionKey, JSON.stringify(next));
      setSession(next);
      setConversation(started.conversation);
    })()
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not open reception.");
      })
      .finally(() => {
        loading.current = null;
      });
    return loading.current;
  }, []);

  useEffect(() => {
    if (shown && !conversation) void initialize();
  }, [shown, conversation, initialize]);
  useEffect(() => {
    if (shown) closeButton.current?.focus();
  }, [shown]);
  useEffect(() => {
    if (shown && showBooking && chosen && !pending) {
      bookingPanel.current?.scrollTo({ top: 0 });
      nameInput.current?.focus();
    }
  }, [shown, showBooking, chosen, pending]);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversation, busy, showBooking]);
  const close = useCallback(() => {
    setOpen(false);
    setBookingMode(false);
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!shown) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [shown, close]);

  async function refresh() {
    if (session)
      setConversation(
        await receptionistRequest<Conversation>(
          `/conversations/${session.id}`,
          session,
        ),
      );
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!session || !conversation || !message.trim() || busy) return;
    const content = message.trim();
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const previousUserCount = conversation.messages.filter(
      (item) => item.role === "user",
    ).length;
    setOptimisticMessageId(optimisticId);
    setConversation({
      ...conversation,
      messages: [
        ...conversation.messages,
        {
          id: optimisticId,
          role: "user",
          content,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setMessage("");
    setBusy(true);
    setError("");
    try {
      setConversation(
        await receptionistRequest<Conversation>(
          `/conversations/${session.id}/messages`,
          session,
          { message: content },
        ),
      );
      setOptimisticMessageId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message.");
      try {
        const latest = await receptionistRequest<Conversation>(
          `/conversations/${session.id}`,
          session,
        );
        setConversation(latest);
        setOptimisticMessageId(null);
        // A failed AI reply may still have persisted the visitor's message.
        if (
          latest.messages.filter((item) => item.role === "user").length ===
          previousUserCount
        )
          setMessage(content);
      } catch {
        // Keep the local message visible without claiming it was delivered.
      }
    } finally {
      setBusy(false);
    }
  }
  async function findSlots(e: FormEvent) {
    e.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setChosen(null);
    setConfirmed(false);
    setSlots([]);
    setCheckedDate("");
    try {
      const result = await receptionistRequest<Slot[]>(
        `/conversations/${session.id}/slots`,
        session,
        { date },
      );
      setSlots(result);
      setCheckedDate(date);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not check availability.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function book(e: FormEvent) {
    e.preventDefault();
    if (!session || busy || (!pending && (!chosen || !confirmed))) return;
    const request = pending || {
      ...details,
      request_id: crypto.randomUUID(),
      start: chosen!.start,
      confirmed,
    };
    setPending(request);
    sessionStorage.setItem(pendingKey(session.id), JSON.stringify(request));
    setBusy(true);
    setError("");
    try {
      await receptionistRequest(
        `/conversations/${session.id}/bookings`,
        session,
        request,
      );
      setPending(null);
      sessionStorage.removeItem(pendingKey(session.id));
      setChosen(null);
      setConfirmed(false);
      await refresh();
    } catch (e) {
      if (
        e instanceof ReceptionistError &&
        [
          "SLOT_EXPIRED",
          "SLOT_UNAVAILABLE",
          "VALIDATION_ERROR",
          "ALREADY_BOOKED",
          "BOOKING_FAILED",
        ].includes(e.code)
      ) {
        setPending(null);
        sessionStorage.removeItem(pendingKey(session.id));
      }
      if (
        e instanceof ReceptionistError &&
        ["SLOT_EXPIRED", "SLOT_UNAVAILABLE", "BOOKING_FAILED"].includes(e.code)
      ) {
        setChosen(null);
        setConfirmed(false);
        setSlots([]);
        setCheckedDate("");
        setStaleOffers(
          conversation?.messages
            .filter((item) => item.slots?.length)
            .map((item) => item.id) || [],
        );
      }
      setError(
        e instanceof Error
          ? e.message
          : "Confirmation is uncertain. Retry the same booking below.",
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function choose(slot: Slot, offeredSlots: Slot[] = slots) {
    if (activeBooking || pending) return;
    setDate(dateInTimezone(slot.start, timezone));
    setSlots(offeredSlots);
    setCheckedDate("");
    setChosen(slot);
    setConfirmed(false);
    setError("");
    setBookingMode(true);
  }
  function openBooking() {
    if (
      !chosen &&
      !pending &&
      latestOffer?.slots?.length &&
      !staleOffers.includes(latestOffer.id)
    ) {
      setDate(dateInTimezone(latestOffer.slots[0].start, timezone));
      setSlots(latestOffer.slots);
    }
    setBookingMode(true);
  }

  return (
    <>
      {!shown && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl hover:bg-slate-700"
          aria-label="Open Nanonux AI support chat"
        >
          <MessageCircle size={20} /> Ask Nanonux
        </button>
      )}
      {shown && (
        <section
          aria-label="Nanonux Business Central AI receptionist"
          className="fixed bottom-3 right-3 z-[60] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:bottom-5 sm:right-5"
        >
          <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <h2 className="font-semibold">Nanonux Business Central</h2>
              <p className="text-xs text-slate-300">
                AI support & appointment booking
              </p>
            </div>
            <button
              ref={closeButton}
              onClick={close}
              aria-label="Close support chat"
              className="rounded p-2 hover:bg-slate-700"
            >
              <X size={18} />
            </button>
          </header>
          <div className="flex border-b border-slate-100 p-2 text-xs">
            <button
              disabled={busy}
              aria-pressed={!showBooking}
              className="flex-1 rounded p-2 hover:bg-slate-100"
              onClick={() => {
                setOpen(true);
                setBookingMode(false);
                onClose();
              }}
            >
              Chat
            </button>
            <button
              disabled={busy}
              aria-pressed={showBooking}
              className="flex flex-1 items-center justify-center gap-2 rounded p-2 hover:bg-slate-100"
              onClick={openBooking}
            >
              <CalendarDays size={15} /> Book a call
            </button>
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-500">
            You’re chatting with AI. Conversations and contact details are saved
            for Nanonux support review. Please don’t share passwords or payment
            details.
          </p>
          <div
            ref={log}
            hidden={
              !!conversation &&
              showBooking &&
              activeBooking?.status !== "CONFIRMED"
            }
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            className="min-h-24 flex-1 space-y-3 overflow-y-auto p-4 max-h-[50dvh]"
          >
            {!conversation && (
              <p className="text-sm text-slate-500">
                {error
                  ? "Reception could not be opened."
                  : "Opening reception…"}
              </p>
            )}
            {conversation?.messages.map((m) => (
              <article
                key={m.id}
                className={`max-w-[95%] rounded-xl p-3 text-sm ${m.role === "user" ? "ml-auto bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase opacity-60">
                  {m.role === "user"
                    ? "You"
                    : m.role === "system"
                      ? "Booking update"
                      : "Nanonux AI"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {m.role === "user" ? m.content : receptionistText(m.content)}
                </p>
                {m.id === optimisticMessageId && (
                  <p className="mt-1 text-[10px] opacity-70">
                    {busy ? "Sending…" : "Delivery unconfirmed"}
                  </p>
                )}
                {!!m.slots?.length &&
                  m.id === latestOffer?.id &&
                  !staleOffers.includes(m.id) &&
                  !activeBooking &&
                  !pending &&
                  !showBooking && (
                    <SlotOptions
                      slots={m.slots}
                      timezone={timezone}
                      disabled={busy}
                      onChoose={(slot) => choose(slot, m.slots)}
                    />
                  )}
              </article>
            ))}
            {busy && (
              <p role="status" className="text-xs text-slate-500">
                {optimisticMessageId ? "Nanonux AI is replying…" : "Working…"}
              </p>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="mx-4 mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-800"
            >
              {error}
            </p>
          )}
          {!conversation && error && (
            <button
              className={`${buttonClass} m-4`}
              onClick={() => {
                setError("");
                void initialize();
              }}
            >
              Retry connection
            </button>
          )}
          {activeBooking?.status === "CONFIRMED" && (
            <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <strong>Appointment confirmed</strong>
              <p>
                {displayTime(activeBooking.start, activeBooking.timezone)} (
                {activeBooking.timezone})
              </p>
              <p className="text-xs">
                An invitation was requested for {activeBooking.email}. Check
                your inbox and spam folder.
              </p>
              {activeBooking.event_url && (
                <a
                  href={activeBooking.event_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open Google Calendar
                </a>
              )}
            </div>
          )}
          {showBooking &&
            conversation &&
            activeBooking?.status !== "CONFIRMED" && (
              <div
                ref={bookingPanel}
                className="max-h-[60dvh] overflow-y-auto border-t border-slate-100 p-4"
              >
                <h3 className="mb-2 text-sm font-semibold">
                  {chosen || pending
                    ? "Confirm your call"
                    : "Choose a time for your call"}
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Appointment times are shown in {timezone}.
                </p>
                {!connected && !pending ? (
                  <p className="text-sm">
                    Online booking is not connected yet. Ask the team in chat
                    about arranging a call.
                  </p>
                ) : (
                  <>
                    {!pending && !chosen && (
                      <form
                        onSubmit={findSlots}
                        className="flex items-end gap-2"
                      >
                        <label className="flex-1 text-xs">
                          Preferred date
                          <input
                            required
                            type="date"
                            value={date}
                            onChange={(e) => {
                              setDate(e.target.value);
                              setChosen(null);
                              setSlots([]);
                              setCheckedDate("");
                            }}
                            className={inputClass}
                            disabled={busy}
                          />
                        </label>
                        <button
                          disabled={busy || !session}
                          className={buttonClass}
                        >
                          Check times
                        </button>
                      </form>
                    )}
                    {!chosen && checkedDate && !slots.length && (
                      <p className="mt-2 text-xs">
                        No available appointments for this date. Please choose
                        another day.
                      </p>
                    )}
                    {!pending && !chosen && !!slots.length && (
                      <SlotOptions
                        slots={slots}
                        timezone={timezone}
                        disabled={busy}
                        onChoose={(slot) => choose(slot)}
                      />
                    )}
                    {(chosen || pending) && (
                      <form onSubmit={book} className="space-y-3">
                        <p className="text-sm font-semibold">
                          {displayTime(
                            pending?.start || chosen!.start,
                            timezone,
                          )}{" "}
                          ({timezone})
                        </p>
                        {!pending && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setChosen(null);
                              setConfirmed(false);
                              setError("");
                            }}
                            className="text-xs font-medium text-emerald-700 underline"
                          >
                            Change time
                          </button>
                        )}
                        {pending ? (
                          <p className="text-sm">
                            Your booking is awaiting confirmation. Retry this
                            request to check its outcome safely.
                          </p>
                        ) : (
                          <>
                            <label className="block text-xs">
                              Name
                              <input
                                ref={nameInput}
                                required
                                maxLength={120}
                                autoComplete="name"
                                value={details.name}
                                onChange={(e) =>
                                  setDetails({
                                    ...details,
                                    name: e.target.value,
                                  })
                                }
                                className={inputClass}
                                disabled={busy}
                              />
                            </label>
                            <label className="block text-xs">
                              Email
                              <input
                                required
                                type="email"
                                maxLength={254}
                                autoComplete="email"
                                value={details.email}
                                onChange={(e) =>
                                  setDetails({
                                    ...details,
                                    email: e.target.value,
                                  })
                                }
                                className={inputClass}
                                disabled={busy}
                              />
                            </label>
                            <label className="block text-xs">
                              Business / company (optional)
                              <input
                                maxLength={160}
                                value={details.company}
                                onChange={(e) =>
                                  setDetails({
                                    ...details,
                                    company: e.target.value,
                                  })
                                }
                                className={inputClass}
                                disabled={busy}
                              />
                            </label>
                            <label className="block text-xs">
                              What would you like to discuss?
                              <textarea
                                maxLength={2000}
                                value={details.notes}
                                onChange={(e) =>
                                  setDetails({
                                    ...details,
                                    notes: e.target.value,
                                  })
                                }
                                className={inputClass}
                                disabled={busy}
                              />
                            </label>
                            <label className="flex items-start gap-2 text-xs">
                              <input
                                type="checkbox"
                                required
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                                disabled={busy}
                              />
                              I confirm these details and agree to share them
                              with Nanonux and Google Calendar to arrange this
                              appointment.
                            </label>
                          </>
                        )}
                        <button
                          disabled={busy || (!pending && !confirmed)}
                          className={`${buttonClass} w-full`}
                        >
                          {pending
                            ? "Retry booking confirmation"
                            : "Confirm appointment"}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
          {(!showBooking || activeBooking?.status === "CONFIRMED") &&
            conversation && (
              <form
                onSubmit={send}
                className="flex gap-2 border-t border-slate-100 p-3"
              >
                <label className="sr-only" htmlFor="receptionist-message">
                  Your message
                </label>
                <input
                  id="receptionist-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={4000}
                  placeholder="Ask about Business Central…"
                  className={inputClass}
                  disabled={busy}
                  required
                />
                <button
                  disabled={busy || !message.trim()}
                  className={buttonClass}
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </form>
            )}
          {conversation && (
            <button
              disabled={busy || !!pending}
              onClick={() => {
                sessionStorage.removeItem(sessionKey);
                setConversation(null);
                setSession(null);
                setChosen(null);
                setPending(null);
                setSlots([]);
                setStaleOffers([]);
                setDate("");
                setCheckedDate("");
                setConfirmed(false);
                setDetails({ name: "", email: "", company: "", notes: "" });
                setMessage("");
                setOptimisticMessageId(null);
                setError("");
              }}
              className="border-t border-slate-100 p-2 text-[11px] text-slate-500 hover:text-slate-900"
            >
              Start a new conversation
            </button>
          )}
        </section>
      )}
    </>
  );
}
