import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ConversationAttachment, ConversationListResponse, ConversationMessage, ConversationMessagesResponse,
  ConversationSearchResponse, ConversationSummary, CurrentUserResponse, ExecutionStreamEvent,
  MAX_MESSAGE_TEXT_LENGTH, RuntimeExecutionResponse, UsageDashboard,
} from "@gexor/contracts";
import { ApiClient, ApiError } from "./api/client";

type Props = { current: CurrentUserResponse; client: ApiClient; logout: () => void; openProviders: () => void };
const terminal = new Set(["completed", "failed", "timed_out", "cancelled"]);

export function ProductionWorkspace({ current, client, logout, openProviders }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [files, setFiles] = useState<ConversationAttachment[]>([]);
  const [draft, setDraft] = useState(""); const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [activeExecution, setActiveExecution] = useState<string>(); const [streamingText, setStreamingText] = useState("");
  const [usage, setUsage] = useState<UsageDashboard>(); const [showUsage, setShowUsage] = useState(false);
  const streamController = useRef<AbortController | undefined>(undefined);

  const loadConversations = useCallback(async () => {
    const result = await client.request<ConversationListResponse>(`/api/v1/workspaces/${current.workspace.workspaceId}/conversations`);
    setConversations(result.conversations); setSelected((value) => value && result.conversations.some((item) => item.conversationId === value) ? value : result.conversations[0]?.conversationId);
  }, [client, current.workspace.workspaceId]);
  const loadMessages = useCallback(async (id: string) => setMessages((await client.request<ConversationMessagesResponse>(`/api/v1/conversations/${id}/messages`)).messages), [client]);
  const loadFiles = useCallback(async (id: string) => setFiles((await client.request<{files:ConversationAttachment[]}>(`/api/v1/conversations/${id}/files`)).files), [client]);
  useEffect(() => { void loadConversations().catch((value) => setError(message(value))); }, [loadConversations]);
  useEffect(() => { if (selected) { void loadMessages(selected).catch((value) => setError(message(value))); void loadFiles(selected).catch((value) => setError(message(value))); } else { setMessages([]); setFiles([]); } }, [selected, loadMessages, loadFiles]);

  async function createConversation() {
    const title = prompt("Conversation title", `Conversation ${conversations.length + 1}`)?.trim(); if (!title) return;
    try { const item = await client.request<ConversationSummary>(`/api/v1/workspaces/${current.workspace.workspaceId}/conversations`, { method: "POST", body: JSON.stringify({ title }) }); await loadConversations(); setSelected(item.conversationId); }
    catch (value) { setError(message(value)); }
  }
  async function renameConversation() {
    if (!selected) return; const currentTitle = conversations.find((item) => item.conversationId === selected)?.title ?? ""; const title = prompt("Rename conversation", currentTitle)?.trim(); if (!title || title === currentTitle) return;
    try { await client.request(`/api/v1/conversations/${selected}`, { method: "PATCH", body: JSON.stringify({ title }) }); await loadConversations(); }
    catch (value) { setError(message(value)); }
  }
  async function deleteConversation() {
    if (!selected || !confirm("Delete this conversation? Its audit history will be retained.")) return;
    try { await client.request(`/api/v1/conversations/${selected}`, { method: "DELETE" }); setSelected(undefined); await loadConversations(); }
    catch (value) { setError(message(value)); }
  }
  async function searchHistory(event: FormEvent) {
    event.preventDefault(); if (!query.trim()) return loadConversations();
    try { const result = await client.request<ConversationSearchResponse>(`/api/v1/workspaces/${current.workspace.workspaceId}/conversations/search?q=${encodeURIComponent(query.trim())}`); setConversations(result.results.map((item) => item.conversation)); }
    catch (value) { setError(message(value)); }
  }

  async function followExecution(executionId: string, conversationId: string) {
    streamController.current?.abort(); const controller = new AbortController(); streamController.current = controller;
    setActiveExecution(executionId); setStreamingText("");
    try {
      await client.streamExecution(executionId, (event: ExecutionStreamEvent) => {
        if (event.eventType === "response.delta" && typeof event.payload.delta === "string") setStreamingText((text) => text + event.payload.delta);
        if (["execution.failed", "execution.timed_out"].includes(event.eventType)) setError(safeEventError(event));
      }, controller.signal);
    } finally { setActiveExecution(undefined); setStreamingText(""); await loadMessages(conversationId); await loadConversations(); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); const text = draft.trim(); if (!text || busy) return; setBusy(true); setError("");
    try { let id = selected; if (!id) { const item = await client.request<ConversationSummary>(`/api/v1/workspaces/${current.workspace.workspaceId}/conversations`, { method: "POST", body: JSON.stringify({ title: text.slice(0, 60) }) }); id = item.conversationId; setSelected(id); }
      setDraft(""); const accepted = await client.request<{executionId:string}>(`/api/v1/conversations/${id}/messages`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ content: [{ type: "text", text }] }) });
      await loadMessages(id); await followExecution(accepted.executionId, id);
    } catch (value) { if (!(value instanceof DOMException && value.name === "AbortError")) { setDraft(text); setError(message(value)); } } finally { setBusy(false); }
  }
  async function cancel() { if (!activeExecution) return; try { await client.request(`/api/v1/executions/${activeExecution}/cancel`, { method: "POST" }); } catch (value) { setError(message(value)); } }
  async function executionAction(execution: RuntimeExecutionResponse, action: "retry" | "regenerate") {
    if (busy) return; setBusy(true); setError("");
    try { const result = await client.request<{executionId:string}>(`/api/v1/executions/${execution.executionId}/${action}`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }); await followExecution(result.executionId, execution.conversationId); }
    catch (value) { setError(message(value)); } finally { setBusy(false); }
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !selected) return; const body = new FormData(); body.append("file", file);
    try { await client.request(`/api/v1/conversations/${selected}/files`, { method: "POST", body }); await loadFiles(selected); }
    catch (value) { setError(message(value)); } finally { event.target.value = ""; }
  }
  async function removeFile(fileId: string) { if (!selected || !confirm("Remove this attachment?")) return; try { await client.request(`/api/v1/files/${fileId}`, { method: "DELETE" }); await loadFiles(selected); } catch (value) { setError(message(value)); } }
  async function openUsage() { try { setUsage(await client.request<UsageDashboard>(`/api/v1/workspaces/${current.workspace.workspaceId}/usage`)); setShowUsage(true); } catch (value) { setError(message(value)); } }

  const title = conversations.find((item) => item.conversationId === selected)?.title ?? "New conversation";
  return <div className="app-shell"><header><div><span className="logo small">G</span><strong>Gexor</strong></div><nav><button className="active">Chat</button><button onClick={openProviders}>Providers</button><button onClick={() => void openUsage()}>Usage</button><button onClick={logout}>Log out</button></nav></header>
    <main className="workspace"><aside><div className="aside-head"><span>Conversations</span><button onClick={() => void createConversation()} aria-label="New conversation">＋</button></div>
      <form className="history-search" onSubmit={searchHistory}><input aria-label="Search history" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Search history"/><button>Search</button></form>
      {conversations.length === 0 ? <p className="muted">Start a conversation below.</p> : conversations.map((item) => <button className={selected === item.conversationId ? "conversation active" : "conversation"} onClick={() => setSelected(item.conversationId)} key={item.conversationId}>{item.title}</button>)}</aside>
      <section className="chat"><div className="chat-title"><div><h1>{title}</h1><p>{current.workspace.name}</p></div><div className="chat-actions"><button onClick={() => void renameConversation()} disabled={!selected}>Rename</button><button onClick={() => void deleteConversation()} disabled={!selected}>Delete</button><button className="mobile-new" onClick={() => void createConversation()}>New</button></div></div>
        <div className="attachments"><label className="attachment-upload">Attach PDF, TXT, or Markdown context<input type="file" accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf" onChange={(event) => void upload(event)} disabled={!selected}/></label>{files.map((file) => <span key={file.fileId}>{file.displayName} · {file.extractionState}<button aria-label={`Remove ${file.displayName}`} onClick={() => void removeFile(file.fileId)}>×</button></span>)}</div>
        <div className="messages">{messages.length === 0 && !streamingText ? <div className="empty"><span className="logo">G</span><h2>What would you like to explore?</h2><p>Your conversation will remain in this workspace after refresh.</p></div> : messages.map((item) => <MessageView key={item.messageId} item={item} userName={current.user.displayName} busy={busy} action={executionAction}/>) }
          {streamingText && <article className="assistant streaming"><span>Gexor · streaming</span><SafeMarkdown text={streamingText}/></article>}</div>
        {error && <div className="error banner" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
        <form className="composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message Gexor…" rows={1} maxLength={MAX_MESSAGE_TEXT_LENGTH} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>{activeExecution ? <button type="button" className="cancel" onClick={() => void cancel()}>Stop</button> : <button className="send" disabled={busy || !draft.trim()}>{busy ? "…" : "↑"}</button>}</form>
      </section></main>
    {showUsage && usage && <div className="modal" role="dialog" aria-modal="true"><section><button className="modal-close" aria-label="Close usage modal" onClick={() => setShowUsage(false)}>Close</button><h2>Usage — last 30 days</h2><div className="usage-grid"><strong>{usage.totals.requests}<small>Requests</small></strong><strong>{usage.totals.totalTokens}<small>Tokens</small></strong><strong>{usage.pricingVersion === "pricing_unpriced_v1" ? "Unpriced" : `$${(usage.totals.estimatedCostMicros / 1_000_000).toFixed(2)}`}<small>{usage.pricingVersion === "pricing_unpriced_v1" ? "Pricing model" : "Estimated spend"}</small></strong><strong>{usage.totals.successful}<small>Successful</small></strong></div><p>Measured: {usage.usageClassification.measured}; estimated: {usage.usageClassification.estimated}; unavailable: {usage.usageClassification.unavailable}</p></section></div>}
  </div>;
}

function MessageView({ item, userName, busy, action }: { item: ConversationMessage; userName: string; busy: boolean; action: (execution: RuntimeExecutionResponse, action: "retry" | "regenerate") => Promise<void> }) {
  const execution = item.execution as RuntimeExecutionResponse | undefined;
  return <article className={item.role}><span>{item.role === "user" ? userName : "Gexor"}</span>{item.role === "assistant" ? <SafeMarkdown text={item.text}/> : <p>{item.text}</p>}
    {execution && !terminal.has(execution.state) && <small>Execution: {execution.state}</small>}
    {execution?.failure && <small>{execution.failure.detail}</small>}
    {item.role === "assistant" && execution && ["failed", "timed_out", "cancelled"].includes(execution.state) && <button disabled={busy} onClick={() => void action(execution, "retry")}>Retry</button>}
    {item.role === "assistant" && execution?.state === "completed" && <button disabled={busy} onClick={() => void action(execution, "regenerate")}>Regenerate</button>}
  </article>;
}

export function SafeMarkdown({ text }: { text: string }) {
  const parts = text.split(/```([A-Za-z0-9_-]*)\n([\s\S]*?)```/g);
  return <div className="markdown">{parts.map((part, index) => index % 3 === 2 ? <pre key={index}><button onClick={() => void navigator.clipboard?.writeText(part)}>Copy</button><code>{part}</code></pre> : index % 3 === 1 ? <Fragment key={index}/> : <Fragment key={index}>{part.split("\n").map((line, lineIndex) => <p key={lineIndex}>{line || "\u00a0"}</p>)}</Fragment>)}</div>;
}
function safeEventError(event: ExecutionStreamEvent): string { const failure = event.payload.failure; return typeof failure === "object" && failure !== null && "detail" in failure ? String((failure as {detail:unknown}).detail) : "The execution did not complete."; }
function message(value: unknown) { return value instanceof ApiError || value instanceof Error ? value.message : "Something went wrong. Please try again."; }
