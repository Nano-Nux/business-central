"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { useShop } from "@/lib/shop";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import type { AIConversation, AIMessage, AIUsage } from "@/lib/types";

/**
 * Strict client-side HTML sanitizer to eliminate XSS vectors from AI/database outputs.
 * Allows formatting, tables, lists, cards, badges.
 * Strips script, style, iframe, object, embed, forms, inline event handlers (on*), and javascript: URIs.
 */
function sanitizeAiHtml(raw: string): string {
  if (typeof window === "undefined" || !raw) return raw || "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");

    // Remove dangerous executable or embedding tags
    const dangerousSelectors = [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "link",
      "meta",
      "base",
      "svg",
    ];
    doc.querySelectorAll(dangerousSelectors.join(",")).forEach((el) => el.remove());

    // Iterate through all remaining elements and strip unsafe attributes
    const allElements = doc.querySelectorAll("*");
    allElements.forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.toLowerCase().trim();

        // Remove all on* event handlers (e.g. onerror, onload, onclick)
        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
        // Remove javascript: and data: URLs in href/src
        if (
          (name === "href" || name === "src") &&
          (value.startsWith("javascript:") || value.startsWith("data:text/html"))
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return doc.body.innerHTML;
  } catch {
    // Fallback basic regex cleanup if DOMParser fails
    return raw
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }
}

export function AIAssistantPage() {
  const { isMerchant, can, merchant } = useAuth();
  const offline = useOffline();
  const { currentShop } = useShop();

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // AI Usage & Quota State
  const initialUsageLimit = merchant?.ai_usage_limit ?? 50;
  const initialUsageCount = merchant?.ai_usage_count ?? 0;
  const [usage, setUsage] = useState<AIUsage>({
    usage_count: initialUsageCount,
    usage_limit: initialUsageLimit,
    remaining: Math.max(0, initialUsageLimit - initialUsageCount),
    is_limit_reached: initialUsageCount >= initialUsageLimit,
  });

  // Voice recording state
  const [isListening, setIsListening] = useState(false);
  const [voiceInterimText, setVoiceInterimText] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const speechRecognitionRef = useRef<{
    start: () => void;
    stop: () => void;
    continuous?: boolean;
    interimResults?: boolean;
    lang?: string;
    onstart?: (() => void) | null;
    onresult?: ((event: {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
    }) => void) | null;
    onerror?: ((event: { error: string }) => void) | null;
    onend?: (() => void) | null;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = useTransition();

  const isOnline = offline.status !== "offline";
  const isEnabledForMerchant = merchant?.ai_assistant_enabled ?? false;
  const isAllowedForUser = isMerchant || can("ai.chat");

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const loadConversations = useCallback(async () => {
    if (!isOnline || !isEnabledForMerchant || !isAllowedForUser) return [];
    try {
      const res = await api<AIConversation[]>("/ai/conversations?limit=50");
      setConversations(res);
      return res;
    } catch {
      return [];
    }
  }, [isOnline, isEnabledForMerchant, isAllowedForUser]);

  // Fetch real-time AI usage
  useEffect(() => {
    let active = true;
    if (!isOnline || !isEnabledForMerchant || !isAllowedForUser) return;
    api<AIUsage>("/ai/usage")
      .then((data) => {
        if (active && data) {
          setUsage(data);
        }
      })
      .catch(() => {
        // Keep fallback from merchant
      });
    return () => {
      active = false;
    };
  }, [isOnline, isEnabledForMerchant, isAllowedForUser]);

  // Load conversations on mount
  useEffect(() => {
    let active = true;
    if (!isOnline || !isEnabledForMerchant || !isAllowedForUser) return;

    const fetchInitialConversations = async () => {
      try {
        const res = await api<AIConversation[]>("/ai/conversations?limit=50");
        if (!active) return;
        setConversations(res);
        if (res && res.length > 0) {
          setActiveConversationId((current) => (!current ? res[0].id : current));
        }
      } catch {
        // ignore
      }
    };

    void fetchInitialConversations();

    return () => {
      active = false;
    };
  }, [isOnline, isEnabledForMerchant, isAllowedForUser]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId || !isOnline) return;
    let active = true;
    void api<{ conversation: AIConversation; messages: AIMessage[] }>(
      `/ai/conversations/${activeConversationId}/messages`,
    )
      .then((res) => {
        if (!active) return;
        setMessages(res.messages || []);
      })
      .catch(() => {
        if (!active) return;
        setMessages([]);
      });
    return () => {
      active = false;
    };
  }, [activeConversationId, isOnline]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  async function handleCreateNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  async function handleDeleteConversation(e: React.MouseEvent, conversationId: string) {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;
    try {
      await api<void>(`/ai/conversations/${conversationId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete conversation.");
    }
  }

  async function handleSendMessage(promptText?: string) {
    const textToSend = (promptText ?? inputText).trim();
    if (!textToSend || isProcessing || !isOnline) return;

    if (usage.is_limit_reached) {
      setStatusMessage(`AI usage limit reached (${usage.usage_count}/${usage.usage_limit}). Please contact your administrator.`);
      return;
    }

    setInputText("");
    setVoiceInterimText("");
    setIsProcessing(true);
    setStatusMessage("Thinking…");

    // Optimistic user message
    const tempUserMsg: AIMessage = {
      id: "temp-" + Date.now(),
      conversation_id: activeConversationId || "",
      merchant_id: merchant?.id || "",
      membership_id: "",
      sender_type: "USER",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const targetShopId = activeConversation?.shop_id || currentShop?.id || undefined;
      const res = await api<{
        conversation_id: string;
        shop_id?: string | null;
        shop_name?: string | null;
        user_message: AIMessage;
        ai_message: AIMessage;
        ai_usage_count?: number;
        ai_usage_limit?: number;
      }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: activeConversationId || undefined,
          shop_id: targetShopId,
          message: textToSend,
        }),
      });

      if (typeof res.ai_usage_count === "number") {
        const newCount = res.ai_usage_count;
        const newLimit = res.ai_usage_limit ?? usage.usage_limit;
        setUsage({
          usage_count: newCount,
          usage_limit: newLimit,
          remaining: Math.max(0, newLimit - newCount),
          is_limit_reached: newCount >= newLimit,
        });
      }

      startTransition(() => {
        // If it was a new conversation, update active ID and refresh list
        if (!activeConversationId) {
          setActiveConversationId(res.conversation_id);
          void loadConversations();
        }
        // Replace temp message with server response
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          res.user_message,
          res.ai_message,
        ]);
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to generate response.";
      const errorAIMsg: AIMessage = {
        id: "err-" + Date.now(),
        conversation_id: activeConversationId || "",
        merchant_id: merchant?.id || "",
        membership_id: "",
        sender_type: "ASSISTANT",
        content: `<div class="ai-error-box"><p style="color:var(--danger,#ef4444);font-weight:600;">Error: ${errorMsg}</p><p style="font-size:12px;color:var(--muted);">Please ensure your internet connection is stable and try again.</p></div>`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, errorAIMsg]);
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }

  // Voice Input Handler (Web Speech API + MediaRecorder fallback)
  function toggleVoiceRecording() {
    if (isListening) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  }

  function startVoiceRecording() {
    setVoiceError("");
    setVoiceInterimText("");

    const windowWithSpeech = typeof window !== "undefined"
      ? (window as unknown as Record<string, (new () => NonNullable<(typeof speechRecognitionRef)["current"]>) | undefined>)
      : {};
    const SpeechRecognition =
      windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang =
          document.documentElement.lang === "th"
            ? "th-TH"
            : document.documentElement.lang === "my"
              ? "my-MM"
              : "en-US";

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event) => {
          let interim = "";
          let finalTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            setInputText((prev) => (prev ? prev + " " + finalTranscript : finalTranscript));
          }
          setVoiceInterimText(interim);
        };

        recognition.onerror = (event) => {
          console.warn("Speech recognition error:", event?.error);
          if (event?.error !== "no-speech") {
            setVoiceError(`Voice error: ${event?.error ?? "unknown"}`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          setVoiceInterimText("");
        };

        speechRecognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err) {
        console.warn("SpeechRecognition start failed, trying MediaRecorder:", err);
      }
    }

    // MediaRecorder Fallback
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            stream.getTracks().forEach((track) => track.stop());
            if (audioBlob.size > 0) {
              setIsProcessing(true);
              setStatusMessage("Transcribing audio with Nanonux AI…");
              try {
                const formData = new FormData();
                formData.append("audio", audioBlob, "recording.webm");
                const res = await api<{ text: string }>("/ai/transcribe", {
                  method: "POST",
                  body: formData,
                });
                if (res.text) {
                  setInputText(res.text);
                }
              } catch (err) {
                setVoiceError(err instanceof Error ? err.message : "Transcription failed.");
              } finally {
                setIsProcessing(false);
                setStatusMessage("");
              }
            }
          };

          mediaRecorder.start();
          setIsListening(true);
        })
        .catch((err) => {
          setVoiceError("Microphone access was denied or is not supported.");
          console.error("Microphone error:", err);
        });
    } else {
      setVoiceError("Audio recording is not supported in this browser.");
    }
  }

  function stopVoiceRecording() {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsListening(false);
  }

  function handleCopy(id: string, htmlContent: string) {
    // Extract readable text from HTML for clipboard
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;
    const text = tempDiv.innerText || tempDiv.textContent || "";
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  }

  const suggestedPrompts = isMerchant
    ? [
        { title: "Price Query", prompt: "What is the sell price of red hair clip?" },
        { title: "Today's Profit", prompt: "What is the profit of today?" },
        { title: "Low Stock Alert", prompt: "Show all products with low or zero stock in a table." },
        { title: "Sales Overview", prompt: "Summarize today's sales and completed orders." },
      ]
    : [
        { title: "Price Query", prompt: "What is the sell price of red hair clip?" },
        { title: "Stock Check", prompt: "Check stock availability for products." },
        { title: "Low Stock Alert", prompt: "Show all products with low or zero stock in a table." },
        { title: "Today's Orders", prompt: "List completed orders from today." },
      ];

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Gate 1: Offline check
  if (!isOnline) {
    return (
      <main className="ai-assistant-container screen-center" style={{ padding: "2rem" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center", padding: "2.5rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚡</div>
          <h2>Nanonux AI Requires Active Connection</h2>
          <p style={{ color: "var(--muted)", margin: "1rem 0 1.5rem" }}>
            Nanonux AI Assistant analyzes real-time merchant database metrics and requires an active internet connection.
            Please connect your workstation to the internet to resume AI chat.
          </p>
          <Badge tone="warning">Offline Mode</Badge>
        </div>
      </main>
    );
  }

  // Gate 2: Merchant AI enabled check (Admin permission)
  if (!isEnabledForMerchant) {
    return (
      <main className="ai-assistant-container screen-center" style={{ padding: "2rem" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center", padding: "2.5rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤖</div>
          <h2>Nanonux AI Assistant Not Enabled</h2>
          <p style={{ color: "var(--muted)", margin: "1rem 0 1.5rem" }}>
            Nanonux AI Assistant is not enabled for your store. Platform administrators can activate this feature from the Business Central Platform Admin console.
          </p>
          <Badge tone="neutral">Module Inactive</Badge>
        </div>
      </main>
    );
  }

  // Gate 3: User permission check (Staff permission)
  if (!isAllowedForUser) {
    return (
      <main className="ai-assistant-container screen-center" style={{ padding: "2rem" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center", padding: "2.5rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2>Staff Access Restricted</h2>
          <p style={{ color: "var(--muted)", margin: "1rem 0 1.5rem" }}>
            You do not have permission to access Nanonux AI Assistant. Your merchant owner or manager can grant you the <strong>Staff Nanonux AI Permission</strong> in the Staff Accounts settings.
          </p>
          <Badge tone="danger">Permission Required</Badge>
        </div>
      </main>
    );
  }

  return (
    <div className="nanonux-ai-workspace">
      {/* LEFT SIDEBAR: Conversation History */}
      <aside className={`ai-sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="ai-sidebar-header">
          <div className="ai-brand-title">
            <div>
              <h3>Nanonux AI</h3>
              <small>Business Copilot</small>
            </div>
          </div>
          <button
            className="action-btn"
            onClick={handleCreateNewChat}
            title="Start new conversation"
            aria-label="New chat"
          >
            <Icon name="plus" size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="ai-search-box">
          <Icon name="search" size={14} className="search-icon" />
          <input
            type="search"
            placeholder="Search conversations…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ai-conversations-list">
          {filteredConversations.length === 0 ? (
            <p className="empty-history-text">No conversation history.</p>
          ) : (
            filteredConversations.map((c) => (
              <div
                key={c.id}
                className={`ai-conversation-item ${c.id === activeConversationId ? "active" : ""}`}
                onClick={() => {
                  if (c.id !== activeConversationId) {
                    setMessages([]);
                    setActiveConversationId(c.id);
                  }
                }}
              >
                <div className="conv-content">
                  <span className="conv-title">{c.title}</span>
                  <div className="conv-meta-row">
                    {c.shop_name && (
                      <span className="conv-shop-pill" title={`Scoped to ${c.shop_name}`}>
                        {c.shop_name}
                      </span>
                    )}
                    <small className="conv-time">
                      {new Date(c.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </div>
                </div>
                <button
                  className="conv-delete-btn"
                  onClick={(e) => handleDeleteConversation(e, c.id)}
                  title="Delete conversation"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* AI Usage Quota Card in Sidebar */}
        <div className="ai-sidebar-quota-card">
          <div className="quota-header">
            <span className="quota-title">AI Query Quota</span>
            <span className={`quota-status-pill ${usage.is_limit_reached ? "exhausted" : ""}`}>
              {usage.is_limit_reached ? "Limit Reached" : `${usage.remaining} left`}
            </span>
          </div>
          <div className="quota-bar-track">
            <div
              className={`quota-bar-fill ${
                usage.is_limit_reached
                  ? "danger"
                  : usage.usage_count / Math.max(1, usage.usage_limit) >= 0.8
                  ? "warning"
                  : "normal"
              }`}
              style={{
                width: `${Math.min(100, Math.round((usage.usage_count / Math.max(1, usage.usage_limit)) * 100))}%`,
              }}
            />
          </div>
          <div className="quota-footer">
            <small>{usage.usage_count} / {usage.usage_limit} used</small>
            <small>{Math.min(100, Math.round((usage.usage_count / Math.max(1, usage.usage_limit)) * 100))}%</small>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="ai-chat-viewport">
        {/* Top bar */}
        <header className="ai-chat-topbar">
          <div className="topbar-left">
            <button
              className="toggle-sidebar-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title="Toggle sidebar"
            >
              <Icon name="menu" size={18} />
            </button>
            <div className="ai-status-indicator">
              <span className="live-dot" />
              <strong>Nanonux AI Assistant</strong>
              {activeConversation?.shop_name ? (
                <span className="shop-tag" title="Scoped to this shop">
                  {activeConversation.shop_name}
                </span>
              ) : currentShop ? (
                <span className="shop-tag" title="Active shop">
                  {currentShop.name}
                </span>
              ) : null}
            </div>
          </div>

          <div className="topbar-right">
            <div
              className={`ai-usage-pill ${usage.is_limit_reached ? "limit-reached" : ""}`}
              title={`AI Query Usage: ${usage.usage_count} of ${usage.usage_limit} queries used (${usage.remaining} remaining)`}
            >
              <span className="ai-usage-sparkle">✨</span>
              <span className="ai-usage-text">
                Usage: <strong>{usage.usage_count}</strong> / {usage.usage_limit}
              </span>
              <div className="ai-usage-meter">
                <div
                  className="ai-usage-meter-bar"
                  style={{
                    width: `${Math.min(100, Math.round((usage.usage_count / Math.max(1, usage.usage_limit)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <button className="clear-btn" onClick={handleCreateNewChat}>
              + New Chat
            </button>
          </div>
        </header>

        {/* Message Stream */}
        <div className="ai-message-stream">
          {messages.length === 0 ? (
            <div className="ai-welcome-hero">
              <h1>Nanonux AI</h1>
              <p className="hero-subtitle">
                {currentShop
                  ? (isMerchant
                      ? `Analyzing metrics for ${currentShop.name}. Ask anything about prices, today’s profits, low inventory, top products, or sales.`
                      : `Analyzing store catalog and stock for ${currentShop.name}. Ask about selling prices, inventory levels, order lookups, or product details.`)
                  : (isMerchant
                      ? "Ask anything about prices, today’s profits, low inventory, top products, or sales analysis."
                      : "Ask anything about selling prices, inventory levels, order lookups, or product catalog.")}
              </p>

              <div className="suggested-prompts-grid">
                {suggestedPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    className="suggested-prompt-card"
                    onClick={() => handleSendMessage(item.prompt)}
                  >
                    <span className="prompt-badge">{item.title}</span>
                    <p className="prompt-text">“{item.prompt}”</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((m) => (
                <div key={m.id} className={`message-row ${m.sender_type.toLowerCase()}`}>
                  <div className="message-avatar">
                    {m.sender_type === "USER" ? (
                      <Icon name="user" size={16} />
                    ) : (
                      <Icon name="bot" size={16} />
                    )}
                  </div>

                  <div className="message-bubble-wrap">
                    <div className="message-meta">
                      <span className="sender-name">
                        {m.sender_type === "USER" ? "You" : "Nanonux AI"}
                      </span>
                      <time className="msg-time">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      {m.sender_type === "ASSISTANT" && (
                        <button
                          className="copy-msg-btn"
                          onClick={() => handleCopy(m.id, m.content)}
                          title="Copy text"
                        >
                          {copiedMessageId === m.id ? "✓ Copied" : "Copy"}
                        </button>
                      )}
                    </div>

                    {m.sender_type === "USER" ? (
                      <div className="user-message-text">{m.content}</div>
                    ) : (
                      <div
                        className="ai-message-html"
                        dangerouslySetInnerHTML={{ __html: sanitizeAiHtml(m.content) }}
                      />
                    )}
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="message-row assistant thinking">
                  <div className="message-avatar pulse-avatar">
                    <Icon name="bot" size={16} />
                  </div>
                  <div className="message-bubble-wrap">
                    <div className="thinking-bubble">
                      <div className="bouncing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <small className="thinking-label">{statusMessage || "Thinking…"}</small>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* VOICE RECORDING MODAL OVERLAY */}
        {isListening && (
          <div className="voice-listening-overlay">
            <div className="voice-pulse-ring" />
            <div className="voice-mic-active">
              <Icon name="mic" size={28} />
            </div>
            <h4>Listening… Speak your question</h4>
            <p className="voice-live-text">
              {voiceInterimText || inputText || "e.g., 'What is the profit of today?'"}
            </p>
            <div className="voice-controls">
              <button className="btn-cancel" onClick={stopVoiceRecording}>
                Cancel
              </button>
              <button
                className="btn-send-voice"
                onClick={() => {
                  stopVoiceRecording();
                  if (inputText || voiceInterimText) {
                    handleSendMessage(inputText || voiceInterimText);
                  }
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* INPUT TRAY */}
        <div className="ai-input-tray">
          {voiceError && <div className="voice-error-banner">{voiceError}</div>}

          {usage.is_limit_reached && (
            <div className="ai-limit-reached-banner">
              <Icon name="alert-triangle" size={16} />
              <span>
                <strong>AI usage limit reached ({usage.usage_count}/{usage.usage_limit}).</strong> You have used all allocated AI queries for this merchant. Please contact your platform administrator to increase your limit.
              </span>
            </div>
          )}

          <div className="input-box-wrapper">
            <button
              type="button"
              className={`mic-btn ${isListening ? "active" : ""}`}
              onClick={toggleVoiceRecording}
              title={
                usage.is_limit_reached
                  ? "AI usage limit reached"
                  : isListening
                  ? "Stop listening"
                  : "Speak your query (Voice Input)"
              }
              aria-label="Voice input"
              disabled={isProcessing || usage.is_limit_reached}
            >
              <Icon name="mic" size={20} />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={
                usage.is_limit_reached
                  ? `AI usage limit reached (${usage.usage_count}/${usage.usage_limit}). Contact administrator.`
                  : "Ask Nanonux AI… (e.g. 'What is the sell price of red hair clip?')"
              }
              value={inputText}
              disabled={isProcessing || usage.is_limit_reached}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
            />

            <button
              type="button"
              className="send-btn"
              onClick={() => void handleSendMessage()}
              disabled={!inputText.trim() || isProcessing || usage.is_limit_reached}
              title={
                usage.is_limit_reached
                  ? "AI usage limit reached. Contact administrator to increase limit."
                  : "Send message"
              }
              aria-label="Send message"
            >
              <Icon name="send" size={16} />
            </button>
          </div>
          <div className="input-hint">
            <span>Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline</span>
            <span>Online Mode Active</span>
          </div>
        </div>
      </main>

      {/* STYLES FOR RICH HTML, CHAT BUBBLES, AND TABLES */}
      <style jsx global>{`
        /* SHELL RESETS FOR AI ASSISTANT VIEWPORT */
        .main-area:has(.nanonux-ai-workspace),
        .main-area.main-area-ai {
          height: 100vh !important;
          max-height: 100vh !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .content:has(.nanonux-ai-workspace),
        .content.content-ai {
          padding: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          width: 100% !important;
          flex: 1 1 0% !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }

        [data-layout="modern-executive-layout"] .content:has(.nanonux-ai-workspace),
        [data-layout="modern-executive-layout"] .content.content-ai {
          padding: 16px 0 0 !important;
        }

        @media (max-width: 1024px) {
          [data-layout="modern-executive-layout"] .content:has(.nanonux-ai-workspace),
          [data-layout="modern-executive-layout"] .content.content-ai {
            padding: 12px 0 0 !important;
          }
        }

        @media (max-width: 640px) {
          [data-layout="modern-executive-layout"] .content:has(.nanonux-ai-workspace),
          [data-layout="modern-executive-layout"] .content.content-ai {
            padding: 8px 0 0 !important;
          }
        }

        .nanonux-ai-workspace {
          display: flex;
          flex: 1 1 0%;
          height: 100%;
          min-height: 0;
          width: 100%;
          background: var(--canvas, #f8fafc);
          color: var(--text, #0f172a);
          overflow: hidden;
          font-family: inherit;
        }

        /* SIDEBAR */
        .ai-sidebar {
          width: 280px;
          min-width: 280px;
          height: 100%;
          min-height: 0;
          background: var(--surface, #ffffff);
          border-right: 1px solid var(--border, #e2e8f0);
          display: flex;
          flex-direction: column;
          transition: width 0.25s ease, transform 0.25s ease;
          overflow: hidden;
          z-index: 10;
        }

        .ai-sidebar.collapsed {
          width: 0;
          min-width: 0;
          border-right: none;
        }

        .ai-sidebar-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }

        .ai-brand-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ai-brand-title h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .ai-brand-title small {
          font-size: 11px;
          color: var(--muted, #64748b);
        }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--primary, #3b82f6);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .action-btn:hover {
          opacity: 0.9;
        }

        .ai-search-box {
          flex: 0 0 auto;
          padding: 0.75rem 1rem;
          position: relative;
        }

        .ai-search-box input {
          width: 100%;
          padding: 6px 10px 6px 30px;
          font-size: 12px;
          border-radius: 6px;
          border: 1px solid var(--border, #cbd5e1);
          background: var(--canvas, #f8fafc);
        }

        .ai-search-box .search-icon {
          position: absolute;
          left: 20px;
          top: 18px;
          color: var(--muted, #94a3b8);
        }

        .ai-conversations-list {
          flex: 1 1 0%;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 0.5rem 1rem;
          -webkit-overflow-scrolling: touch;
        }

        .empty-history-text {
          font-size: 12px;
          color: var(--muted, #94a3b8);
          text-align: center;
          margin-top: 2rem;
        }

        .ai-conversation-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 6px;
          margin-bottom: 3px;
          cursor: pointer;
          font-size: 13px;
          transition: background 0.15s;
        }

        .ai-conversation-item:hover {
          background: var(--hover, #f1f5f9);
        }

        .ai-conversation-item.active {
          background: var(--primary-subtle, #eff6ff);
          color: var(--primary, #2563eb);
          font-weight: 600;
        }

        .conv-content {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
        }

        .conv-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }

        .conv-shop-pill {
          display: inline-block;
          font-size: 10px;
          line-height: 1.2;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(37, 99, 235, 0.08);
          color: var(--primary, #2563eb);
          font-weight: 500;
          max-width: 110px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-time {
          font-size: 10px;
          color: var(--muted, #94a3b8);
        }

        .conv-delete-btn {
          opacity: 0;
          background: none;
          border: none;
          color: var(--muted, #94a3b8);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }

        .ai-conversation-item:hover .conv-delete-btn {
          opacity: 1;
        }

        .conv-delete-btn:hover {
          color: var(--danger, #ef4444);
        }

        /* CHAT VIEWPORT */
        .ai-chat-viewport {
          flex: 1 1 0%;
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          background: var(--canvas, #f8fafc);
          overflow: hidden;
        }

        .ai-chat-topbar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          background: var(--surface, #ffffff);
          border-bottom: 1px solid var(--border, #e2e8f0);
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .toggle-sidebar-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: var(--text, #0f172a);
          border-radius: 4px;
        }

        .ai-status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        }

        .shop-tag {
          font-size: 11px;
          color: var(--muted, #64748b);
          background: var(--hover, #f1f5f9);
          padding: 2px 8px;
          border-radius: 12px;
        }

        .clear-btn {
          font-size: 12px;
          background: none;
          border: 1px solid var(--border, #cbd5e1);
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--text, #334155);
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ai-usage-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .ai-usage-pill.limit-reached {
          background: #fef2f2;
          border-color: #fecaca;
          color: #991b1b;
        }

        .ai-usage-sparkle {
          font-size: 13px;
        }

        .ai-usage-text {
          font-size: 11px;
        }

        .ai-usage-meter {
          width: 44px;
          height: 6px;
          background: rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          overflow: hidden;
        }

        .ai-usage-meter-bar {
          height: 100%;
          background: #10b981;
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        .ai-usage-pill.limit-reached .ai-usage-meter-bar {
          background: #ef4444;
        }

        .ai-sidebar-quota-card {
          margin: 10px;
          padding: 11px 12px;
          background: var(--surface, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 9px;
        }

        .quota-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 7px;
        }

        .quota-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted, #64748b);
        }

        .quota-status-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 999px;
          background: #ecfdf5;
          color: #047857;
        }

        .quota-status-pill.exhausted {
          background: #fef2f2;
          color: #b91c1c;
        }

        .quota-bar-track {
          width: 100%;
          height: 5px;
          background: var(--hover, #f1f5f9);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 5px;
        }

        .quota-bar-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        .quota-bar-fill.normal {
          background: #10b981;
        }

        .quota-bar-fill.warning {
          background: #f59e0b;
        }

        .quota-bar-fill.danger {
          background: #ef4444;
        }

        .quota-footer {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--muted, #64748b);
        }

        .ai-limit-reached-banner {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 8px;
          padding: 9px 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
          font-size: 12px;
          line-height: 1.4;
        }

        /* MESSAGE STREAM */
        .ai-message-stream {
          flex: 1 1 0%;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          -webkit-overflow-scrolling: touch;
        }

        /* HERO / WELCOME */
        .ai-welcome-hero {
          margin: auto;
          max-width: 640px;
          text-align: center;
          padding: 2rem 1rem;
        }

        .hero-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 68px;
          height: 68px;
          border-radius: 20px;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          color: #ffffff;
          margin-bottom: 1.25rem;
          box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
        }

        .ai-welcome-hero h1 {
          font-size: 1.75rem;
          font-weight: 800;
          margin: 0 0 0.5rem;
          letter-spacing: -0.02em;
        }

        .hero-subtitle {
          color: var(--muted, #64748b);
          font-size: 14px;
          margin-bottom: 2rem;
        }

        .suggested-prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
          text-align: left;
        }

        .suggested-prompt-card {
          background: var(--surface, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .suggested-prompt-card:hover {
          border-color: var(--primary, #3b82f6);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }

        .prompt-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--primary, #3b82f6);
          letter-spacing: 0.05em;
        }

        .prompt-text {
          margin: 6px 0 0;
          font-size: 13px;
          color: var(--text, #1e293b);
          line-height: 1.4;
        }

        /* MESSAGES LIST */
        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          max-width: 860px;
          width: 100%;
          margin: 0 auto;
        }

        .message-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .message-row.user {
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 14px;
        }

        .message-row.user .message-avatar {
          background: var(--primary, #3b82f6);
          color: #ffffff;
        }

        .message-row.assistant .message-avatar {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
        }

        .message-bubble-wrap {
          max-width: 80%;
          display: flex;
          flex-direction: column;
        }

        .message-row.user .message-bubble-wrap {
          align-items: flex-end;
        }

        .message-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--muted, #64748b);
          margin-bottom: 4px;
        }

        .copy-msg-btn {
          background: none;
          border: none;
          font-size: 10px;
          color: var(--muted, #94a3b8);
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .copy-msg-btn:hover {
          color: var(--text, #0f172a);
          background: var(--hover, #f1f5f9);
        }

        .user-message-text {
          background: var(--primary, #3b82f6);
          color: #ffffff;
          padding: 10px 16px;
          border-radius: 16px 4px 16px 16px;
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .ai-message-html {
          background: var(--surface, #ffffff);
          color: var(--text, #0f172a);
          padding: 16px 20px;
          border-radius: 4px 16px 16px 16px;
          font-size: 14px;
          line-height: 1.6;
          border: 1px solid var(--border, #e2e8f0);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          word-break: break-word;
        }

        /* HTML TABLE STYLES INSIDE AI RESPONSE */
        .ai-message-html table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 13px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border, #cbd5e1);
        }

        .ai-message-html th {
          background: var(--surface-subtle, #f1f5f9);
          color: var(--text, #334155);
          text-align: left;
          padding: 8px 12px;
          font-weight: 600;
          border-bottom: 1px solid var(--border, #cbd5e1);
        }

        .ai-message-html td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }

        .ai-message-html tr:nth-child(even) {
          background: var(--canvas, #f8fafc);
        }

        .ai-message-html tr:hover {
          background: var(--hover, #e2e8f0);
        }

        .ai-message-html p {
          margin: 0.5rem 0;
        }

        .ai-message-html p:first-child {
          margin-top: 0;
        }

        .ai-message-html p:last-child {
          margin-bottom: 0;
        }

        .ai-message-html strong {
          color: var(--text-emphasis, #0f172a);
        }

        .ai-stat-card {
          display: inline-flex;
          flex-direction: column;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 10px;
          padding: 10px 16px;
          margin: 0.5rem 0.5rem 0.5rem 0;
        }

        .ai-stat-card .stat-label {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--muted, #64748b);
          font-weight: 600;
        }

        .ai-stat-card strong {
          font-size: 16px;
          color: var(--primary, #2563eb);
          margin-top: 2px;
        }

        .ai-restriction-box {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-left: 4px solid #f59e0b;
          border-radius: 6px;
          padding: 12px 16px;
          color: var(--text, #1e293b);
          font-size: 13.5px;
          line-height: 1.5;
        }

        .ai-restriction-box p {
          margin: 0;
        }

        /* THINKING INDICATOR */
        .thinking-bubble {
          background: var(--surface, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 16px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .bouncing-dots {
          display: flex;
          gap: 4px;
        }

        .bouncing-dots span {
          width: 6px;
          height: 6px;
          background: var(--primary, #3b82f6);
          border-radius: 50%;
          animation: bounce 1.2s infinite ease-in-out;
        }

        .bouncing-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .bouncing-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }

        .thinking-label {
          font-size: 12px;
          color: var(--muted, #64748b);
        }

        /* VOICE LISTENING OVERLAY */
        .voice-listening-overlay {
          position: absolute;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface, #ffffff);
          border: 1px solid var(--border, #cbd5e1);
          border-radius: 20px;
          padding: 20px 30px;
          text-align: center;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.15);
          z-index: 20;
          min-width: 320px;
          max-width: 90%;
        }

        .voice-mic-active {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #ef4444;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
          animation: pulseMic 1.5s infinite;
        }

        @keyframes pulseMic {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .voice-listening-overlay h4 {
          margin: 0 0 6px;
          font-size: 14px;
        }

        .voice-live-text {
          font-size: 13px;
          color: var(--muted, #64748b);
          font-style: italic;
          margin: 6px 0 16px;
          min-height: 20px;
        }

        .voice-controls {
          display: flex;
          justify-content: center;
          gap: 12px;
        }

        .btn-cancel {
          background: var(--surface-subtle, #f1f5f9);
          border: 1px solid var(--border, #cbd5e1);
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 12px;
          cursor: pointer;
        }

        .btn-send-voice {
          background: var(--primary, #3b82f6);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        /* INPUT TRAY */
        .ai-input-tray {
          flex: 0 0 auto;
          padding: 1rem 1.5rem;
          background: var(--surface, #ffffff);
          border-top: 1px solid var(--border, #e2e8f0);
        }

        .voice-error-banner {
          font-size: 11px;
          color: var(--danger, #ef4444);
          margin-bottom: 6px;
          text-align: center;
        }

        .input-box-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--canvas, #f8fafc);
          border: 1px solid var(--border, #cbd5e1);
          border-radius: 14px;
          padding: 6px 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-box-wrapper:focus-within {
          border-color: var(--primary, #3b82f6);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .input-box-wrapper textarea {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          line-height: 1.4;
          resize: none;
          outline: none;
          color: var(--text, #0f172a);
          max-height: 120px;
        }

        .mic-btn {
          background: none;
          border: none;
          color: var(--muted, #64748b);
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
        }

        .mic-btn:hover {
          color: var(--primary, #3b82f6);
          background: rgba(59, 130, 246, 0.08);
        }

        .mic-btn.active {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .send-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--primary, #3b82f6);
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .send-btn:not(:disabled):hover {
          opacity: 0.9;
          transform: scale(1.04);
        }

        .input-hint {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--muted, #94a3b8);
          margin-top: 6px;
          padding: 0 4px;
        }

        @media (max-width: 768px) {
          .ai-sidebar {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            height: 100%;
            z-index: 25;
            box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
            transform: translateX(-100%);
          }
          .ai-sidebar.open {
            transform: translateX(0);
          }
          .message-bubble-wrap {
            max-width: 90%;
          }
        }
      `}</style>
    </div>
  );
}
