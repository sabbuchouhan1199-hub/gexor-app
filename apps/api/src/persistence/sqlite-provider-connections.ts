import { randomUUID } from "node:crypto";
import type { ModelCatalogueEntry, ProviderCatalogueEntry, ProviderHealthState, ProviderRoutingStatus, UpdateProviderRoutingRequest, WorkspaceProviderConnection } from "@gexor/contracts";
import type { TextProvider } from "../providers/provider.js";
import { SqliteDatabase } from "./database.js";

type InternalConnection = WorkspaceProviderConnection & { credentialReference: string };
export type ConnectionValidator = (input: { providerKey: string; credentialReference: string }) => Promise<boolean>;
export type ConnectionProviderResolver = (input: { providerKey: string; modelId: string; credentialReference: string }) => Promise<TextProvider>;

export class SqliteProviderConnectionRepository {
  constructor(private readonly database: SqliteDatabase, private readonly options: { now?: () => Date; createId?: () => string } = {}) {}
  private now() { return (this.options.now ?? (() => new Date()))().toISOString(); }
  private id(prefix: string) { return `${prefix}_${(this.options.createId ?? randomUUID)()}`; }

  listProviders(): ProviderCatalogueEntry[] {
    return this.database.prepare("SELECT provider_key, display_name, status FROM provider_catalog ORDER BY provider_key").all().map((value) => {
      const row = value as { provider_key: string; display_name: string; status: "active" | "disabled" };
      return { providerKey: row.provider_key, displayName: row.display_name, status: row.status };
    });
  }
  listModels(providerKey?: string): ModelCatalogueEntry[] {
    const rows = providerKey
      ? this.database.prepare("SELECT * FROM model_catalog WHERE provider_key = ? ORDER BY model_key").all(providerKey)
      : this.database.prepare("SELECT * FROM model_catalog ORDER BY model_key").all();
    return rows.map((value) => { const row = value as { model_key: string; provider_key: string; provider_model_id: string; display_name: string; status: "active" | "disabled" }; return { modelKey: row.model_key, providerKey: row.provider_key, providerModelId: row.provider_model_id, displayName: row.display_name, status: row.status }; });
  }
  create(workspaceId: string, actorUserId: string, providerKey: string, credentialReference: string): WorkspaceProviderConnection {
    if (!/^[A-Za-z][A-Za-z0-9._:/-]{2,255}$/.test(credentialReference)) throw new Error("Invalid protected credential reference.");
    if (!this.database.prepare("SELECT 1 FROM provider_catalog WHERE provider_key = ? AND status = 'active'").get(providerKey)) throw new Error("Unknown provider.");
    const id = this.id("connection"); const timestamp = this.now();
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO provider_connections(id, workspace_id, provider_key, credential_reference, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending_validation', ?, ?, ?)").run(id, workspaceId, providerKey, credentialReference, actorUserId, timestamp, timestamp);
      this.audit(workspaceId, id, actorUserId, "connected", timestamp);
    });
    return this.get(workspaceId, id)!;
  }
  list(workspaceId: string): WorkspaceProviderConnection[] { return this.database.prepare("SELECT * FROM provider_connections WHERE workspace_id = ? ORDER BY created_at").all(workspaceId).map((row) => this.public(row as Record<string, unknown>)); }
  get(workspaceId: string, id: string): WorkspaceProviderConnection | undefined { const row = this.database.prepare("SELECT * FROM provider_connections WHERE workspace_id = ? AND id = ?").get(workspaceId, id) as Record<string, unknown> | undefined; return row ? this.public(row) : undefined; }
  internal(workspaceId: string, id: string): InternalConnection | undefined { const row = this.database.prepare("SELECT * FROM provider_connections WHERE workspace_id = ? AND id = ?").get(workspaceId, id) as Record<string, unknown> | undefined; return row ? { ...this.public(row), credentialReference: String(row.credential_reference) } : undefined; }
  recordValidation(workspaceId: string, id: string, actorUserId: string, valid: boolean): WorkspaceProviderConnection | undefined { const timestamp = this.now(); this.database.transaction(() => { this.database.prepare("UPDATE provider_connections SET status = ?, validated_at = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND status <> 'revoked'").run(valid ? "active" : "invalid", timestamp, timestamp, workspaceId, id); this.audit(workspaceId, id, actorUserId, valid ? "validated" : "validation_failed", timestamp); }); return this.get(workspaceId, id); }
  select(workspaceId: string, id: string, modelKey: string, actorUserId: string): boolean { const connection = this.internal(workspaceId, id); const model = this.database.prepare("SELECT provider_key FROM model_catalog WHERE model_key = ? AND status = 'active'").get(modelKey) as { provider_key: string } | undefined; if (!connection || connection.status !== "active" || !model || model.provider_key !== connection.providerKey) return false; const timestamp = this.now(); this.database.transaction(() => { this.database.prepare("INSERT INTO workspace_provider_selection(workspace_id, connection_id, model_key, selected_by, selected_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET connection_id=excluded.connection_id, model_key=excluded.model_key, selected_by=excluded.selected_by, selected_at=excluded.selected_at").run(workspaceId, id, modelKey, actorUserId, timestamp); this.audit(workspaceId, id, actorUserId, "selected", timestamp); }); return true; }
  selected(workspaceId: string): (InternalConnection & { modelId: string }) | undefined { const row = this.database.prepare("SELECT pc.*, mc.provider_model_id FROM workspace_provider_selection s JOIN provider_connections pc ON pc.id=s.connection_id AND pc.workspace_id=s.workspace_id JOIN model_catalog mc ON mc.model_key=s.model_key WHERE s.workspace_id=? AND pc.status='active'").get(workspaceId) as (Record<string, unknown> & { provider_model_id: string }) | undefined; return row ? { ...this.public(row), credentialReference: String(row.credential_reference), modelId: row.provider_model_id } : undefined; }
  revoke(workspaceId: string, id: string, actorUserId: string): WorkspaceProviderConnection | undefined { const timestamp=this.now(); this.database.transaction(() => { this.database.prepare("DELETE FROM workspace_provider_selection WHERE workspace_id=? AND connection_id=?").run(workspaceId,id); this.database.prepare("UPDATE provider_connections SET status='revoked', revoked_at=?, updated_at=?, version=version+1 WHERE workspace_id=? AND id=?").run(timestamp,timestamp,workspaceId,id); this.audit(workspaceId,id,actorUserId,"revoked",timestamp); }); return this.get(workspaceId,id); }
  rotateReference(workspaceId: string, id: string, actorUserId: string, credentialReference: string): WorkspaceProviderConnection | undefined { if (!/^[A-Za-z][A-Za-z0-9._:/-]{2,255}$/.test(credentialReference)) throw new Error("Invalid protected credential reference."); const timestamp=this.now(); this.database.transaction(() => { this.database.prepare("DELETE FROM workspace_provider_selection WHERE workspace_id=? AND connection_id=?").run(workspaceId,id); this.database.prepare("UPDATE provider_connections SET credential_reference=?, status='pending_validation', validated_at=NULL, updated_at=?, version=version+1 WHERE workspace_id=? AND id=? AND status<>'revoked'").run(credentialReference,timestamp,workspaceId,id); this.audit(workspaceId,id,actorUserId,"credential_reference_rotated",timestamp); }); return this.get(workspaceId,id); }
  routing(workspaceId: string): ProviderRoutingStatus[] {
    return (this.database.prepare("SELECT * FROM provider_routing WHERE workspace_id=? ORDER BY is_default DESC, priority, connection_id").all(workspaceId) as Record<string, unknown>[]).map((row) => ({
      connectionId: String(row.connection_id), priority: Number(row.priority), enabled: Boolean(row.enabled), isDefault: Boolean(row.is_default),
      healthState: row.health_state as ProviderHealthState, consecutiveFailures: Number(row.consecutive_failures),
      ...(row.last_checked_at ? { lastCheckedAt: String(row.last_checked_at) } : {}), ...(row.safe_failure_code ? { safeFailureCode: String(row.safe_failure_code) } : {}),
      ...(row.safe_failure_message ? { safeFailureMessage: String(row.safe_failure_message) } : {}), ...(row.latency_ms !== null ? { latencyMs: Number(row.latency_ms) } : {}),
    }));
  }
  configureRouting(workspaceId: string, connectionId: string, input: UpdateProviderRoutingRequest): ProviderRoutingStatus | undefined {
    if (!this.internal(workspaceId, connectionId)) return undefined;
    const priority = input.priority;
    if (priority !== undefined && (!Number.isSafeInteger(priority) || priority < 0 || priority > 10_000)) throw new Error("Invalid provider priority.");
    const timestamp = this.now();
    this.database.transaction(() => {
      if (input.isDefault) this.database.prepare("UPDATE provider_routing SET is_default=0, updated_at=? WHERE workspace_id=?").run(timestamp, workspaceId);
      this.database.prepare(`UPDATE provider_routing SET
        priority=COALESCE(?,priority), enabled=COALESCE(?,enabled), is_default=COALESCE(?,is_default),
        health_state=CASE WHEN ?=0 THEN 'disabled' WHEN ?=1 AND health_state='disabled' THEN 'unknown' ELSE health_state END,
        updated_at=? WHERE workspace_id=? AND connection_id=?`).run(
          priority ?? null, input.enabled === undefined ? null : Number(input.enabled), input.isDefault === undefined ? null : Number(input.isDefault),
          input.enabled === undefined ? null : Number(input.enabled), input.enabled === undefined ? null : Number(input.enabled), timestamp, workspaceId, connectionId,
        );
    });
    return this.routing(workspaceId).find((item) => item.connectionId === connectionId);
  }
  recordHealth(workspaceId: string, connectionId: string, state: Exclude<ProviderHealthState, "disabled">, latencyMs: number, safeFailureCode?: string): ProviderRoutingStatus | undefined {
    const timestamp = this.now();
    this.database.prepare(`UPDATE provider_routing SET health_state=?, last_checked_at=?, latency_ms=?,
      safe_failure_code=?, safe_failure_message=?, consecutive_failures=CASE WHEN ?='healthy' THEN 0 ELSE consecutive_failures+1 END, updated_at=?
      WHERE workspace_id=? AND connection_id=? AND enabled=1`).run(state, timestamp, Math.max(0, Math.round(latencyMs)), safeFailureCode ?? null,
        safeFailureCode ? "Provider health check failed safely." : null, state, timestamp, workspaceId, connectionId);
    return this.routing(workspaceId).find((item) => item.connectionId === connectionId);
  }
  routeCandidates(workspaceId: string): Array<InternalConnection & { modelId: string }> {
    const rows = this.database.prepare(`SELECT pc.*, mc.provider_model_id FROM provider_routing r
      JOIN provider_connections pc ON pc.id=r.connection_id AND pc.workspace_id=r.workspace_id
      JOIN model_catalog mc ON mc.model_key=r.model_key
      WHERE r.workspace_id=? AND r.enabled=1 AND pc.status='active' AND r.health_state IN ('unknown','healthy','degraded')
      ORDER BY r.is_default DESC, r.priority, r.connection_id`).all(workspaceId) as Array<Record<string, unknown> & { provider_model_id: string }>;
    return rows.map((row) => ({ ...this.public(row), credentialReference: String(row.credential_reference), modelId: row.provider_model_id }));
  }
  auditCount(workspaceId: string) { return Number((this.database.prepare("SELECT count(*) AS count FROM provider_connection_audit WHERE workspace_id=?").get(workspaceId) as {count:number}).count); }
  private audit(workspaceId:string, connectionId:string, actor:string, action:string, timestamp:string) { this.database.prepare("INSERT INTO provider_connection_audit(id,workspace_id,connection_id,actor_account_id,action,evidence_json,created_at) VALUES (?,?,?,?,?,'{}',?)").run(this.id("audit"),workspaceId,connectionId,actor,action,timestamp); }
  private public(row: Record<string, unknown>): WorkspaceProviderConnection { return { connectionId:String(row.id), workspaceId:String(row.workspace_id), providerKey:String(row.provider_key), status:row.status as WorkspaceProviderConnection["status"], createdAt:String(row.created_at), updatedAt:String(row.updated_at), ...(row.validated_at ? {validatedAt:String(row.validated_at)} : {}), ...(row.revoked_at ? {revokedAt:String(row.revoked_at)} : {}) }; }
}

export class WorkspaceProviderConnectionService {
  constructor(private readonly repository: SqliteProviderConnectionRepository, private readonly validator: ConnectionValidator, private readonly resolver: ConnectionProviderResolver) {}
  async validate(workspaceId:string,id:string,actor:string) {
    const connection=this.repository.internal(workspaceId,id); if(!connection || connection.status==="revoked") return undefined;
    const started=Date.now(); let valid=false;
    try { valid=await this.validator(connection); }
    catch { valid=false; }
    const result=this.repository.recordValidation(workspaceId,id,actor,valid);
    this.repository.recordHealth(workspaceId,id,valid?"healthy":"unhealthy",Date.now()-started,valid?undefined:"PROVIDER_CONNECTION_INVALID");
    return result;
  }
  async providerForWorkspace(workspaceId:string,attempt=1): Promise<TextProvider> {
    const candidates=this.repository.routeCandidates(workspaceId);
    const selected=candidates[Math.min(Math.max(0,attempt-1),candidates.length-1)] ?? this.repository.selected(workspaceId);
    if(!selected) throw new Error("No healthy active workspace provider connection is available.");
    return this.resolver({providerKey:selected.providerKey,modelId:selected.modelId,credentialReference:selected.credentialReference});
  }
}
