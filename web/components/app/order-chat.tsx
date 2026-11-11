"use client";

import { MessageCircle, SendHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { type ChatMessage, useLiveEvent } from "@/components/app/live-updates";
import { apiRequest } from "@/lib/browser-api";
import { markChatOpen } from "@/lib/chat-open";

type Part = ChatMessage["part"];
type Thread = {
  you: Part;
  open: boolean;
  rider: boolean;
  pickup: boolean;
  members: { part: Part; name: string }[];
  unread: number;
  messages: ChatMessage[];
};

const PART_LABEL: Record<Part, string> = { RESIDENT: "Customer", VENDOR: "Store", RIDER: "Rider" };

/** One tap for what's said most, in each person's part of the order */
const QUICK: Record<Part, string[]> = {
  RESIDENT: ["Nasaan na po kayo?", "Pakitawag na lang po ako pagdating.", "Paki-iwan na lang po sa gate.", "Salamat po!"],
  RIDER: ["Papunta na po ako sa store.", "Nasa store na po ako, hinihintay ang order.", "Papunta na po ako sa inyo.", "Nasa labas na po ako."],
  VENDOR: ["Inihahanda na po namin ang order ninyo.", "Ready na po ang order.", "Pasensya na po, ubos na ang isa sa order ninyo. Okay lang po bang palitan?", "Salamat po!"],
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

const looks = {
  button:
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-semibold text-ink transition hover:bg-canvas motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
  pill: "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500",
  link: "inline-flex w-fit items-center gap-2 font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500",
};

/**
 * The order's chat: a button (with the number of new messages) that opens the thread shared by the
 * customer, the store and the rider. New messages arrive live; a link with ?chat=<order id>
 * (from the "Reply" on a message toast) opens it straight away.
 */
export function OrderChat({ orderId, look = "button", label }: { orderId: string; look?: keyof typeof looks; label?: string }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Thread>(`/chat/${orderId}`).then((result) => {
      if (!cancelled && result.ok) setThread(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, reload]);

  // Opened from a message's "Reply"
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") !== orderId) return;
    params.delete("chat");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    const timer = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(timer);
  }, [orderId]);

  useLiveEvent((event) => {
    if (event.type === "chat.message" && event.orderId === orderId) {
      setThread((t) =>
        t && !t.messages.some((m) => m.id === event.message.id)
          ? { ...t, messages: [...t.messages, event.message], unread: open ? 0 : t.unread + 1 }
          : t,
      );
    }
    // A rider joined, or the order finished: who's in the chat and whether it's open may change
    if (event.type === "order.updated" && event.orderId === orderId) setReload((n) => n + 1);
  });

  // Stable, so the open chat doesn't mark itself read on every render
  const close = useCallback(() => setOpen(false), []);
  const sent = useCallback(
    (message: ChatMessage) => setThread((t) => (t && !t.messages.some((m) => m.id === message.id) ? { ...t, messages: [...t.messages, message] } : t)),
    [],
  );
  const read = useCallback(() => setThread((t) => (t && t.unread ? { ...t, unread: 0 } : t)), []);

  if (!thread || (!thread.open && thread.messages.length === 0)) return null;
  const others = thread.members.filter((m) => m.part !== thread.you);
  const text = label ?? (look === "button" ? `Chat with ${others.map((m) => (m.part === "VENDOR" ? "the store" : m.part === "RIDER" ? "your rider" : m.name)).join(" and ")}` : "Chat");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`relative ${looks[look]}`}>
        <MessageCircle className={look === "pill" ? "size-4 text-brand-600" : "size-[18px]"} aria-hidden />
        {text}
        {thread.unread > 0 && (
          <span key={thread.unread} className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white tabular-nums motion-safe:animate-pop">
            {thread.unread}
            <span className="sr-only"> new</span>
          </span>
        )}
      </button>
      {open && (
        <ChatSheet orderId={orderId} thread={thread} onClose={close} onSent={sent} onRead={read} />
      )}
    </>
  );
}

function ChatSheet({
  orderId,
  thread,
  onClose,
  onSent,
  onRead,
}: {
  orderId: string;
  thread: Thread;
  onClose: () => void;
  onSent: (message: ChatMessage) => void;
  onRead: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const count = thread.messages.length;

  useEffect(() => {
    dialog.current?.showModal();
    return markChatOpen(orderId);
  }, [orderId]);

  // Seen: everything on screen is read, including messages that arrive while it's open
  const markRead = useCallback(() => {
    onRead();
    void apiRequest(`/chat/${orderId}/read`, { method: "POST" });
  }, [orderId, onRead]);
  useEffect(() => {
    markRead();
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: count > 1 ? "smooth" : "auto" });
  }, [count, markRead]);

  async function send(body: string) {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(undefined);
    const result = await apiRequest<{ message: ChatMessage }>(`/chat/${orderId}`, { method: "POST", body: { body: text } });
    setSending(false);
    if (!result.ok) return setError(result.fieldErrors?.body?.[0] ?? result.error);
    onSent(result.data.message);
    setDraft("");
    input.current?.focus();
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  // Enter sends; Shift+Enter starts a new line
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const others = thread.members.filter((m) => m.part !== thread.you);
  const waitingForRider = !thread.rider && !thread.pickup && thread.you !== "RIDER";

  return (
    <dialog
      ref={dialog}
      aria-label="Order chat"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-0 mt-auto h-[min(640px,88dvh)] max-h-none w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40 motion-safe:animate-[sheet-up_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:m-auto sm:h-[min(640px,85dvh)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-3xl"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <MessageCircle className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink">Order chat</h2>
            <p className="truncate text-sm text-muted">
              {others.map((m) => `${m.name} (${PART_LABEL[m.part].toLowerCase()})`).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the chat"
            className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-canvas/60 px-4 py-4" aria-live="polite">
          {waitingForRider && (
            <p className="mx-auto w-fit max-w-[90%] rounded-full bg-white px-3 py-1 text-center text-xs text-muted ring-1 ring-line">
              Your rider joins this chat once one takes the order.
            </p>
          )}
          {count === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="font-semibold text-ink">No messages yet</p>
              <p className="mt-1 text-sm text-muted">
                Everyone in this order sees what you write here. Tap a quick reply below, or type your own.
              </p>
            </div>
          ) : (
            thread.messages.map((m, i) => {
              const sameAsBefore = i > 0 && thread.messages[i - 1].part === m.part && thread.messages[i - 1].mine === m.mine;
              return (
                <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"} ${sameAsBefore ? "-mt-2" : ""}`}>
                  {!m.mine && !sameAsBefore && (
                    <span className="mb-1 px-1 text-xs font-medium text-muted">
                      {m.name} <span className="text-gray-400">· {PART_LABEL[m.part]}</span>
                    </span>
                  )}
                  <p
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere] motion-safe:animate-[fade-in_0.2s_ease-out] ${
                      m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-ink ring-1 ring-line"
                    }`}
                  >
                    {m.body}
                  </p>
                  <span className="mt-0.5 px-1 text-[11px] text-gray-400">{clock(m.createdAt)}</span>
                </div>
              );
            })
          )}
        </div>

        {thread.open ? (
          <div className="border-t border-line bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
              {QUICK[thread.you].map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(q)}
                  className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  {q}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-end gap-2">
              <label className="sr-only" htmlFor={`chat-${orderId}`}>
                Message
              </label>
              <textarea
                id={`chat-${orderId}`}
                ref={input}
                rows={1}
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder="Write a message"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-2.5 text-[15px] text-ink outline-none [field-sizing:content] placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <SendHorizontal className="size-5" aria-hidden />
              </button>
            </form>
            {error && (
              <p className="mt-1.5 px-1 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className="border-t border-line bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted">
            This chat closed when the order finished.
          </p>
        )}
      </div>
    </dialog>
  );
}
