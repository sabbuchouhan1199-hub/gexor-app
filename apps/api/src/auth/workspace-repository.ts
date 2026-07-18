import { randomUUID } from "node:crypto";

import type { PersonalWorkspace, WorkspaceMembership } from "@gexor/contracts";

export type WorkspaceAuthorization = {
  workspace: PersonalWorkspace;
  membership: WorkspaceMembership;
};

export interface WorkspaceRepository {
  provisionPersonalWorkspace(userId: string, displayName: string): Promise<WorkspaceAuthorization>;
  findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceAuthorization | undefined>;
  authorize(userId: string, workspaceId: string): Promise<WorkspaceAuthorization | undefined>;
  deletePersonalWorkspaceForUser(userId: string): Promise<void>;
}

export type InMemoryWorkspaceRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  readonly #workspaces = new Map<string, PersonalWorkspace>();
  readonly #memberships = new Map<string, WorkspaceMembership>();
  readonly #workspaceIdByOwner = new Map<string, string>();
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: InMemoryWorkspaceRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async provisionPersonalWorkspace(userId: string, displayName: string): Promise<WorkspaceAuthorization> {
    const existing = await this.findPersonalWorkspaceForUser(userId);
    if (existing) return existing;
    const timestamp = this.#now().toISOString();
    const workspaceId = `workspace_${this.#createId()}`;
    const workspace: PersonalWorkspace = {
      workspaceId,
      ownerUserId: userId,
      name: `${displayName} Workspace`,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const membership: WorkspaceMembership = {
      membershipId: `membership_${this.#createId()}`,
      workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#workspaces.set(workspaceId, workspace);
    this.#memberships.set(this.#membershipKey(userId, workspaceId), membership);
    this.#workspaceIdByOwner.set(userId, workspaceId);
    return this.#snapshot(workspace, membership);
  }

  async findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceAuthorization | undefined> {
    const workspaceId = this.#workspaceIdByOwner.get(userId);
    return workspaceId ? this.authorize(userId, workspaceId) : undefined;
  }

  async authorize(userId: string, workspaceId: string): Promise<WorkspaceAuthorization | undefined> {
    const workspace = this.#workspaces.get(workspaceId);
    const membership = this.#memberships.get(this.#membershipKey(userId, workspaceId));
    if (!workspace || !membership || workspace.status !== "active" || membership.status !== "active") {
      return undefined;
    }
    return this.#snapshot(workspace, membership);
  }

  async deletePersonalWorkspaceForUser(userId: string): Promise<void> {
    const workspaceId = this.#workspaceIdByOwner.get(userId);
    if (!workspaceId) return;
    this.#workspaceIdByOwner.delete(userId);
    this.#workspaces.delete(workspaceId);
    this.#memberships.delete(this.#membershipKey(userId, workspaceId));
  }

  #membershipKey(userId: string, workspaceId: string): string {
    return `${userId}:${workspaceId}`;
  }

  #snapshot(workspace: PersonalWorkspace, membership: WorkspaceMembership): WorkspaceAuthorization {
    return { workspace: { ...workspace }, membership: { ...membership } };
  }
}
