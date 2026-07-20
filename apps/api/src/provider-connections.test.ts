import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { SqliteDatabase } from "./persistence/database.js";
import { SqliteProviderConnectionRepository, WorkspaceProviderConnectionService, type ConnectionHealthChecker, type ConnectionValidator, type ConnectionProviderResolver } from "./persistence/sqlite-provider-connections.js";
import { SqliteRegistrationService } from "./persistence/sqlite-registration-service.js";
import { SqliteConversationRepository, SqliteIdentityRepository, SqliteSessionRepository, SqliteWorkspaceRepository } from "./persistence/sqlite-repositories.js";
import { SqliteMessageAcceptanceRepository, SqliteRuntimeExecutionStore } from "./persistence/sqlite-runtime-repository.js";
import { createWorkspaceProvider } from "./providers/provider-factory.js";
import { loadApiConfig } from "./config.js";

const now=()=>new Date("2026-07-18T15:00:00.000Z");
function ids(){let n=0;return()=>String(++n)}
const tokenGenerator={generate:(()=>{let n=0;return()=>`synthetic_session_${++n}_00000000000000000000000000000000`})(),hash:(v:string)=>createHash("sha256").update(v).digest("hex")};
const passwordHasher={hash:async()=>"scrypt$v1$synthetic",verify:async()=>true};

test("workspace provider connection lifecycle is isolated, audited, and redacted", async()=>{
 const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
 const registration=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
 const first=await registration.register({displayName:"First",email:"first@example.invalid",password:"valid-passphrase"});
 const second=await registration.register({displayName:"Second",email:"second@example.invalid",password:"valid-passphrase"});
 const repository=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  assert.equal(repository.listProviders().length,3); assert.equal(repository.listModels("llama-cpp").length,1);
  assert.equal(repository.listModels("ollama").length,1);
 const connection=repository.create(first.workspace.workspaceId,first.user.userId,"ollama","vault:workspace/first");
 assert.equal(connection.status,"pending_validation"); assert.equal(JSON.stringify(connection).includes("credential"),false);
 assert.equal(repository.get(second.workspace.workspaceId,connection.connectionId),undefined);
 const service=new WorkspaceProviderConnectionService(repository,async({credentialReference})=>credentialReference==="vault:workspace/first",async()=>({generateText:async()=>({provider:"ollama",model:"qwen",text:"ok"})}));
 assert.equal((await service.validate(first.workspace.workspaceId,connection.connectionId,first.user.userId))?.status,"active");
 assert.equal(repository.select(first.workspace.workspaceId,connection.connectionId,"ollama:qwen3-0.6b",first.user.userId),true);
 assert.ok(await service.providerForWorkspace(first.workspace.workspaceId));
 assert.equal(repository.auditCount(first.workspace.workspaceId),3);
 const rotated=repository.rotateReference(first.workspace.workspaceId,connection.connectionId,first.user.userId,"vault:workspace/rotated");
 assert.equal(rotated?.status,"pending_validation"); assert.equal(repository.selected(first.workspace.workspaceId),undefined);
 assert.equal(repository.revoke(first.workspace.workspaceId,connection.connectionId,first.user.userId)?.status,"revoked");
 assert.equal(repository.auditCount(first.workspace.workspaceId),5);
 assert.equal(JSON.stringify(repository.list(first.workspace.workspaceId)).includes("vault:"),false);
 db.close();
});

test("provider connection HTTP lifecycle requires bearer ownership and never returns references", async()=>{
 const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
 const executions=new SqliteRuntimeExecutionStore(db,{now,createId:makeId});
 const repository=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
 const service=new WorkspaceProviderConnectionService(repository,async()=>true,async()=>({generateText:async()=>({provider:"ollama",model:"qwen",text:"ok"})}));
 const app=buildApp({textProvider:{generateText:async()=>({provider:"compat",model:"compat",text:"ok"})},executionStore:executions,identityRepository:new SqliteIdentityRepository(db,{now,createId:makeId}),sessionRepository:new SqliteSessionRepository(db,{now,createId:makeId,tokenGenerator}),workspaceRepository:new SqliteWorkspaceRepository(db,{now,createId:makeId}),passwordHasher,atomicRegistration:new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId}),conversationRepository:new SqliteConversationRepository(db,{now,createId:makeId}),messageAcceptanceRepository:new SqliteMessageAcceptanceRepository(db,executions,{now,createId:makeId}),providerConnectionRepository:repository,providerConnectionService:service,workspaceProviderResolver:(id)=>service.providerForWorkspace(id)});
 const register=async(email:string)=>{const response=await app.inject({method:"POST",url:"/api/v1/auth/register",payload:{displayName:"Owner",email,password:"valid-passphrase"}}); assert.equal(response.statusCode,201); const body=response.json() as {workspace:{workspaceId:string}}; const header=response.headers["set-cookie"]; const values=Array.isArray(header)?header:[String(header)]; const pairs=values.map(value=>value.split(";",1)[0]!); const csrf=pairs.find(value=>value.startsWith("gexor_csrf="))?.slice("gexor_csrf=".length); assert.ok(csrf); return {workspace:body.workspace,cookie:pairs.join("; "),"x-csrf-token":decodeURIComponent(csrf)}};
 const owner=await register("owner@example.invalid"); const other=await register("other@example.invalid");
 const url=`/api/v1/workspaces/${owner.workspace.workspaceId}/provider-connections`;
 assert.equal((await app.inject({method:"POST",url,payload:{providerKey:"ollama",credentialReference:"vault:owner/ref"}})).statusCode,401);
 assert.equal((await app.inject({method:"POST",url,headers:{cookie:other.cookie,"x-csrf-token":other["x-csrf-token"],"x-workspace-id":other.workspace.workspaceId},payload:{providerKey:"ollama",credentialReference:"vault:owner/ref"}})).statusCode,404);
 const connected=await app.inject({method:"POST",url,headers:{cookie:owner.cookie,"x-csrf-token":owner["x-csrf-token"],"x-workspace-id":owner.workspace.workspaceId},payload:{providerKey:"ollama",credentialReference:"vault:owner/ref"}});
 assert.equal(connected.statusCode,201); assert.equal(connected.body.includes("vault:owner/ref"),false); const id=connected.json().connectionId as string;
 const headers={cookie:owner.cookie,"x-csrf-token":owner["x-csrf-token"],"x-workspace-id":owner.workspace.workspaceId};
 assert.equal((await app.inject({method:"POST",url:`${url}/${id}/test`,headers})).statusCode,200);
 assert.equal((await app.inject({method:"POST",url:`${url}/${id}/select`,headers,payload:{modelKey:"ollama:qwen3-0.6b"}})).statusCode,200);
 const conversation=await app.inject({method:"POST",url:`/api/v1/workspaces/${owner.workspace.workspaceId}/conversations`,headers,payload:{title:"Provider selected"}}); assert.equal(conversation.statusCode,201);
 const accepted=await app.inject({method:"POST",url:`/api/v1/conversations/${conversation.json().conversationId}/messages`,headers:{...headers,"idempotency-key":"provider-key"},payload:{content:[{type:"text",text:"hello"}]}}); assert.equal(accepted.statusCode,202);
 assert.equal((await app.inject({method:"POST",url:`${url}/${id}/revoke`,headers})).json().status,"revoked");
  assert.equal((await app.inject({method:"POST",url:`/api/v1/conversations/${conversation.json().conversationId}/messages`,headers:{...headers,"idempotency-key":"provider-key-2"},payload:{content:[{type:"text",text:"again"}]}})).statusCode,409);
  await app.close(); db.close();
});

test("llama-cpp provider and model are exposed via the catalogue endpoint", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate();
  const repository=new SqliteProviderConnectionRepository(db);
  const providers=repository.listProviders();
  assert.ok(providers.find(p=>p.providerKey==="llama-cpp"&&p.displayName==="Local llama.cpp"&&p.status==="active"));
  const models=repository.listModels();
  const qwen=models.find(m=>m.modelKey==="llama-cpp:qwen-local");
  assert.ok(qwen); assert.equal(qwen?.providerKey,"llama-cpp"); assert.equal(qwen?.providerModelId,"qwen-local");
  assert.equal(qwen?.displayName,"Qwen 2.5 3B Local"); assert.equal(qwen?.status,"active");
  db.close();
});

test("llama-cpp connection resolves to LlamaCppProvider even when startup TEXT_PROVIDER is gemini", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"llama-test@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  const config=loadApiConfig({TEXT_PROVIDER:"gemini",LLAMA_CPP_BASE_URL:"http://127.0.0.1:8080/v1"});
  const validator:ConnectionValidator=async({credentialReference})=>
    credentialReference==="local-env:configured";
  const resolver:ConnectionProviderResolver=async({providerKey,modelId,credentialReference})=>{
    if(credentialReference!=="local-env:configured") throw new Error("denied");
    return createWorkspaceProvider(config, providerKey, modelId);
  };
  const service=new WorkspaceProviderConnectionService(repo,validator,resolver);
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"llama-cpp","local-env:configured");
  assert.equal(conn.providerKey,"llama-cpp");
  assert.equal(conn.status,"pending_validation");
  const validated=await service.validate(user.workspace.workspaceId,conn.connectionId,user.user.userId);
  assert.equal(validated?.status,"active");
  assert.equal(repo.select(user.workspace.workspaceId,conn.connectionId,"llama-cpp:qwen-local",user.user.userId),true);
  const selected=repo.selected(user.workspace.workspaceId);
  assert.ok(selected); assert.equal(selected?.providerKey,"llama-cpp"); assert.equal(selected?.modelKey,"llama-cpp:qwen-local");
  assert.equal(selected?.modelId,"qwen-local");
  const provider=await service.providerForWorkspace(user.workspace.workspaceId);
  assert.ok(provider); assert.equal(provider.constructor.name,"LlamaCppProvider");
  db.close();
});

test("llama-cpp connection rejects unknown or mismatched models", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"llama-reject@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"llama-cpp","local-env:configured");
  repo.recordValidation(user.workspace.workspaceId,conn.connectionId,user.user.userId,true);
  assert.equal(repo.select(user.workspace.workspaceId,conn.connectionId,"nonexistent-model",user.user.userId),false);
  assert.equal(repo.select(user.workspace.workspaceId,conn.connectionId,"ollama:qwen3-0.6b",user.user.userId),false);
  db.close();
});

test("connection validated with a healthy llama-cpp check is marked healthy", async () => {
  const db = new SqliteDatabase({ filename: ":memory:", now }); db.migrate(); const makeId = ids();
  const reg = new SqliteRegistrationService(db, { passwordHasher, tokenGenerator, now, createId: makeId });
  const user = await reg.register({ displayName: "Test", email: "llama-healthy@example.invalid", password: "valid-passphrase" });
  const repo = new SqliteProviderConnectionRepository(db, { now, createId: makeId });
  const config = loadApiConfig({ TEXT_PROVIDER: "gemini", LLAMA_CPP_BASE_URL: "http://127.0.0.1:8080/v1" });
  let healthCheckerCalled = false;
  const healthChecker: ConnectionHealthChecker = async ({ providerKey }) => {
    if (providerKey !== "llama-cpp") return false;
    healthCheckerCalled = true;
    return true;
  };
  const service = new WorkspaceProviderConnectionService(repo, async ({ credentialReference }) => credentialReference === "local-env:configured", async ({ providerKey, modelId, credentialReference }) => { if (credentialReference !== "local-env:configured") throw new Error("denied"); return createWorkspaceProvider(config, providerKey, modelId); }, healthChecker);
  const conn = repo.create(user.workspace.workspaceId, user.user.userId, "llama-cpp", "local-env:configured");
  const validated = await service.validate(user.workspace.workspaceId, conn.connectionId, user.user.userId);
  assert.equal(validated?.status, "active");
  assert.equal(healthCheckerCalled, true);
  const routing = repo.routing(user.workspace.workspaceId);
  assert.equal(routing.length, 1);
  assert.equal(routing[0]?.healthState, "healthy");
  db.close();
});

test("connection validated against unreachable provider records unhealthy", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"llama-unreachable@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  const config=loadApiConfig({TEXT_PROVIDER:"gemini",LLAMA_CPP_BASE_URL:"http://127.0.0.1:1/v1"});
  const healthChecker:ConnectionHealthChecker=async({providerKey})=>{
    if(providerKey!=="llama-cpp") return false;
    try{const res=await fetch("http://127.0.0.1:1/health",{signal:AbortSignal.timeout(2_000)});return res.ok;}
    catch{return false;}
  };
  const service=new WorkspaceProviderConnectionService(repo,async({credentialReference})=>credentialReference==="local-env:configured",async({providerKey,modelId,credentialReference})=>{if(credentialReference!=="local-env:configured")throw new Error("denied");return createWorkspaceProvider(config,providerKey,modelId);},healthChecker);
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"llama-cpp","local-env:configured");
  const validated=await service.validate(user.workspace.workspaceId,conn.connectionId,user.user.userId);
  assert.equal(validated?.status,"active");
  const routing=repo.routing(user.workspace.workspaceId);
  assert.equal(routing.length,1);
  assert.equal(routing[0]?.healthState,"unhealthy");
  db.close();
});

test("wrong credential reference is rejected before health check", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"wrong-cred@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  let healthCalled=false;
  const healthChecker:ConnectionHealthChecker=async()=>{healthCalled=true;return true;};
  const service=new WorkspaceProviderConnectionService(repo,async({credentialReference})=>credentialReference==="valid-ref",async()=>{throw new Error("should not be called");},healthChecker);
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"llama-cpp","invalid-ref");
  const validated=await service.validate(user.workspace.workspaceId,conn.connectionId,user.user.userId);
  assert.equal(validated?.status,"invalid");
  assert.equal(healthCalled,false);
  db.close();
});

test("Gemini credential requirement returns unhealthy when key is absent", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"gemini-no-key@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  const healthChecker:ConnectionHealthChecker=async({providerKey})=>{
    if(providerKey!=="gemini") return false;
    return false;
  };
  const service=new WorkspaceProviderConnectionService(repo,async({credentialReference})=>credentialReference==="local-env:configured",async()=>{throw new Error("should not be called");},healthChecker);
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"gemini","local-env:configured");
  const validated=await service.validate(user.workspace.workspaceId,conn.connectionId,user.user.userId);
  assert.equal(validated?.status,"active");
  const routing=repo.routing(user.workspace.workspaceId);
  assert.equal(routing[0]?.healthState,"unhealthy");
  db.close();
});

test("Ollama validated with Gemini startup uses provider-specific health check", async()=>{
  const db=new SqliteDatabase({filename:":memory:",now}); db.migrate(); const makeId=ids();
  const reg=new SqliteRegistrationService(db,{passwordHasher,tokenGenerator,now,createId:makeId});
  const user=await reg.register({displayName:"Test",email:"ollama-check@example.invalid",password:"valid-passphrase"});
  const repo=new SqliteProviderConnectionRepository(db,{now,createId:makeId});
  const config=loadApiConfig({TEXT_PROVIDER:"gemini"});
  let checkedProvider="";
  const healthChecker:ConnectionHealthChecker=async({providerKey})=>{
    checkedProvider=providerKey;
    return providerKey==="ollama";
  };
  const service=new WorkspaceProviderConnectionService(repo,async({credentialReference})=>credentialReference==="local-env:configured",async({providerKey,modelId,credentialReference})=>{if(credentialReference!=="local-env:configured")throw new Error("denied");return createWorkspaceProvider(config,providerKey,modelId);},healthChecker);
  const conn=repo.create(user.workspace.workspaceId,user.user.userId,"ollama","local-env:configured");
  const validated=await service.validate(user.workspace.workspaceId,conn.connectionId,user.user.userId);
  assert.equal(validated?.status,"active");
  assert.equal(checkedProvider,"ollama");
  const routing=repo.routing(user.workspace.workspaceId);
  assert.equal(routing[0]?.healthState,"healthy");
  db.close();
});
