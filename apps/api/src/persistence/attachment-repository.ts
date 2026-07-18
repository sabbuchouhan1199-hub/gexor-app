import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { ConversationAttachment } from "@gexor/contracts";
import { SqliteDatabase } from "./database.js";

export type ParsedUpload = { filename: string; contentType: string; data: Buffer };
const allowed = new Map([["text/plain", [".txt"]], ["text/markdown", [".md", ".markdown"]], ["application/pdf", [".pdf"]]]);

export class AttachmentValidationError extends Error {
  constructor(readonly code: "UPLOAD_TOO_LARGE" | "UNSUPPORTED_FILE_TYPE" | "CONVERSATION_NOT_FOUND") { super(code); }
}

export class SqliteAttachmentRepository {
  private readonly root: string;
  constructor(private readonly database: SqliteDatabase, options: { root: string; maxBytes?: number; maxWorkspaceBytes?: number; maxConversationFiles?: number; maxExtractedCharacters?: number; createId?: () => string; now?: () => Date }) {
    this.root = resolve(options.root); mkdirSync(this.root, { recursive: true });
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024; this.maxWorkspaceBytes = options.maxWorkspaceBytes ?? 25 * 1024 * 1024; this.maxConversationFiles = options.maxConversationFiles ?? 20;
    this.maxExtractedCharacters = options.maxExtractedCharacters ?? 100_000;
    this.createId = options.createId ?? randomUUID; this.now = options.now ?? (() => new Date());
  }
  private readonly maxBytes: number; private readonly maxWorkspaceBytes: number; private readonly maxConversationFiles: number; private readonly maxExtractedCharacters: number;
  private readonly createId: () => string; private readonly now: () => Date;

  create(workspaceId: string, conversationId: string, actorUserId: string, upload: ParsedUpload): ConversationAttachment {
    if (upload.data.length < 1 || upload.data.length > this.maxBytes) throw new AttachmentValidationError("UPLOAD_TOO_LARGE");
    if (!this.database.prepare("SELECT 1 FROM conversations WHERE id=? AND workspace_id=? AND status='active'").get(conversationId, workspaceId)) throw new AttachmentValidationError("CONVERSATION_NOT_FOUND");
    const quota = this.database.prepare("SELECT count(*) files, COALESCE(SUM(size_bytes),0) bytes FROM file_attachments WHERE workspace_id=? AND conversation_id=?").get(workspaceId, conversationId) as { files: number; bytes: number };
    const workspaceBytes = this.database.prepare("SELECT COALESCE(SUM(size_bytes),0) bytes FROM file_attachments WHERE workspace_id=?").get(workspaceId) as { bytes: number };
    if (quota.files >= this.maxConversationFiles || workspaceBytes.bytes + upload.data.length > this.maxWorkspaceBytes) throw new AttachmentValidationError("UPLOAD_TOO_LARGE");
    const contentType = upload.contentType.toLowerCase().split(";", 1)[0]!.trim();
    const extension = normalizedExtension(upload.filename); const extensions = allowed.get(contentType);
    if (!extensions?.includes(extension) || !signatureMatches(contentType, upload.data)) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
    const id = `file_${this.createId()}`; const storageKey = `${this.createId()}.document`; const finalPath = join(this.root, storageKey);
    if (!finalPath.startsWith(`${this.root}/`)) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
    const temporaryPath = `${finalPath}.partial`; const timestamp = this.now().toISOString();
    writeFileSync(temporaryPath, upload.data, { flag: "wx", mode: 0o600 });
    try {
      renameSync(temporaryPath, finalPath);
      const extraction = extractText(contentType, upload.data, this.maxExtractedCharacters);
      this.database.transaction(() => {
        this.database.prepare(`INSERT INTO file_attachments(id,workspace_id,conversation_id,uploaded_by,display_name,content_type,size_bytes,sha256,storage_key,extraction_state,safe_failure_code,extraction_version,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, workspaceId, conversationId, actorUserId, safeDisplayName(upload.filename), contentType, upload.data.length,
            createHash("sha256").update(upload.data).digest("hex"), storageKey, extraction.text ? "ready" : "failed", extraction.text ? null : extraction.failure ?? null,
            "bounded-text-v1", timestamp, timestamp);
        if (extraction.text) for (const [index, chunk] of chunks(extraction.text, 4_000).entries()) this.database.prepare(
          "INSERT INTO file_chunks(id,file_id,chunk_order,section_label,content_text,extraction_version) VALUES (?,?,?,?,?,?)",
        ).run(`chunk_${this.createId()}`, id, index, contentType === "application/pdf" ? `PDF segment ${index + 1}` : `Text segment ${index + 1}`, chunk, "bounded-text-v1");
      });
    } catch (error) { try { unlinkSync(temporaryPath); } catch {} try { unlinkSync(finalPath); } catch {} throw error; }
    return this.get(workspaceId, id)!;
  }

  list(workspaceId: string, conversationId: string): ConversationAttachment[] {
    return (this.database.prepare("SELECT * FROM file_attachments WHERE workspace_id=? AND conversation_id=? ORDER BY created_at,id").all(workspaceId, conversationId) as Record<string, unknown>[]).map(publicAttachment);
  }
  get(workspaceId: string, fileId: string): ConversationAttachment | undefined {
    const row = this.database.prepare("SELECT * FROM file_attachments WHERE workspace_id=? AND id=?").get(workspaceId, fileId) as Record<string, unknown> | undefined;
    return row ? publicAttachment(row) : undefined;
  }
  delete(workspaceId: string, fileId: string): boolean {
    const row = this.database.prepare("SELECT storage_key FROM file_attachments WHERE workspace_id=? AND id=?").get(workspaceId, fileId) as {storage_key:string} | undefined;
    if (!row) return false; this.database.prepare("DELETE FROM file_attachments WHERE workspace_id=? AND id=?").run(workspaceId, fileId);
    const path = join(this.root, basename(row.storage_key)); if (path.startsWith(`${this.root}/`)) try { unlinkSync(path); } catch {}
    return true;
  }
}

export function parseSingleMultipartFile(contentType: string, body: Buffer): ParsedUpload {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType); const boundary = match?.[1] ?? match?.[2]?.trim();
  if (!boundary || boundary.length > 200) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
  const delimiter = Buffer.from(`--${boundary}`); const start = body.indexOf(delimiter); const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
  if (start < 0 || headerEnd < 0) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
  const headers = body.subarray(start + delimiter.length + 2, headerEnd).toString("utf8");
  const disposition = /content-disposition:\s*form-data;[^\r\n]*name="file"[^\r\n]*filename="([^"]*)"/i.exec(headers);
  const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim(); if (!disposition || !type) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
  const dataStart = headerEnd + 4; const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
  if (end < dataStart) throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
  return { filename: disposition[1]!, contentType: type, data: body.subarray(dataStart, end) };
}

function signatureMatches(contentType: string, data: Buffer): boolean {
  if (contentType === "application/pdf") return data.subarray(0, 5).toString("ascii") === "%PDF-" && !data.subarray(0, 1024).includes(Buffer.from("/JavaScript"));
  if (data.includes(0)) return false;
  return !new TextDecoder("utf-8", { fatal: true }).decode(data).includes("\u0000");
}
function normalizedExtension(filename: string): string { const safe = basename(filename).toLowerCase(); const index = safe.lastIndexOf("."); return index >= 0 ? safe.slice(index) : ""; }
function safeDisplayName(filename: string): string { const value = basename(filename).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200); return value || "document"; }
function extractText(contentType: string, data: Buffer, limit: number): { text?: string; failure?: string } {
  if (contentType !== "application/pdf") { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(data).slice(0, limit).trim(); return text ? { text } : { failure: "EMPTY_DOCUMENT" }; } catch { return { failure: "INVALID_TEXT_ENCODING" }; } }
  const source = data.toString("latin1").slice(0, Math.min(data.length, 2_000_000)); const values: string[] = [];
  for (const match of source.matchAll(/\(((?:\\.|[^\\()]){1,4000})\)\s*(?:Tj|')/g)) { values.push(match[1]!.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n")); if (values.join("\n").length >= limit) break; }
  const text = values.join("\n").slice(0, limit).trim(); return text ? { text } : { failure: "PDF_TEXT_UNAVAILABLE" };
}
function chunks(text: string, size: number): string[] { const result: string[] = []; for (let index=0; index<text.length; index+=size) result.push(text.slice(index,index+size)); return result; }
function publicAttachment(row: Record<string, unknown>): ConversationAttachment { return { fileId:String(row.id),conversationId:String(row.conversation_id),displayName:String(row.display_name),contentType:String(row.content_type),sizeBytes:Number(row.size_bytes),extractionState:row.extraction_state as ConversationAttachment["extractionState"],...(row.safe_failure_code?{safeFailureCode:String(row.safe_failure_code)}:{}),createdAt:String(row.created_at),updatedAt:String(row.updated_at) }; }
