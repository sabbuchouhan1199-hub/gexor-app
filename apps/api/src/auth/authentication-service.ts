import type { AuthSessionSummary, AuthenticationResponse, CurrentUserResponse, LoginRequest, RegisterRequest } from "@gexor/contracts";

import { AuthDomainError } from "./auth-errors.js";
import type { IdentityRepository } from "./identity-repository.js";
import type { IdentityService } from "./identity-service.js";
import type { SessionRepository } from "./session-repository.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

export type AtomicRegistrationService = {
  register(input: RegisterRequest): Promise<AuthenticationResponse>;
};

export type AuthenticationServiceOptions = {
  identities: IdentityRepository;
  identityService: IdentityService;
  sessions: SessionRepository;
  workspaces: WorkspaceRepository;
  atomicRegistration?: AtomicRegistrationService;
};

export class AuthenticationService {
  readonly #identities: IdentityRepository;
  readonly #identityService: IdentityService;
  readonly #sessions: SessionRepository;
  readonly #workspaces: WorkspaceRepository;
  readonly #atomicRegistration?: AtomicRegistrationService;

  constructor(options: AuthenticationServiceOptions) {
    this.#identities = options.identities;
    this.#identityService = options.identityService;
    this.#sessions = options.sessions;
    this.#workspaces = options.workspaces;
    this.#atomicRegistration = options.atomicRegistration;
  }

  async register(input: RegisterRequest): Promise<AuthenticationResponse> {
    if (this.#atomicRegistration) return this.#atomicRegistration.register(input);
    const user = await this.#identityService.createIdentity(input);
    try {
      const authorization = await this.#workspaces.provisionPersonalWorkspace(user.userId, user.displayName);
      const createdSession = await this.#sessions.create(user.userId);
      return { user, ...createdSession, ...authorization };
    } catch (error) {
      await this.#workspaces.deletePersonalWorkspaceForUser(user.userId);
      await this.#identities.delete(user.userId);
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthenticationResponse> {
    const user = await this.#identityService.verifyCredentials(input.email, input.password);
    const authorization = await this.#workspaces.findPersonalWorkspaceForUser(user.userId);
    if (!authorization) throw new AuthDomainError("WORKSPACE_INITIALIZATION_FAILED");
    const createdSession = await this.#sessions.create(user.userId);
    return { user, ...createdSession, ...authorization };
  }

  async currentUser(
    userId: string,
    session: AuthSessionSummary,
    workspaceId?: string,
  ): Promise<CurrentUserResponse | undefined> {
    const user = await this.#identities.findById(userId);
    if (!user || user.status !== "active") return undefined;
    const authorization = workspaceId
      ? await this.#workspaces.authorize(userId, workspaceId)
      : await this.#workspaces.findPersonalWorkspaceForUser(userId);
    return authorization ? { user, session, ...authorization } : undefined;
  }
}
