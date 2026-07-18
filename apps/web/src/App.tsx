import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuthenticationResponse, CurrentUserResponse } from "@gexor/contracts";
import { ApiClient } from "./api/client";

import { ProductionWorkspace } from "./Workspace";
import { ProviderSettings } from "./ProviderSettings";
type AuthMode="login"|"register"; type View="chat"|"settings";
export function App(){
 const [current,setCurrent]=useState<CurrentUserResponse>(); const [booting,setBooting]=useState(true); const [authMode,setAuthMode]=useState<AuthMode>("login"); const [error,setError]=useState("");
 const [workspaceView,setWorkspaceView]=useState<View>("chat");
 const client=useMemo(()=>new ApiClient(current?.workspace.workspaceId),[current]);
 const endSession=useCallback(()=>{setCurrent(undefined);setBooting(false)},[]);
 useEffect(()=>{new ApiClient().request<CurrentUserResponse>("/api/v1/auth/me").then(setCurrent).catch(endSession).finally(()=>setBooting(false))},[endSession]);
 async function authenticate(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");const data=new FormData(e.currentTarget);try{const body=authMode==="register"?{displayName:String(data.get("displayName")),email:String(data.get("email")),password:String(data.get("password"))}:{email:String(data.get("email")),password:String(data.get("password"))};const result=await new ApiClient().request<AuthenticationResponse>(`/api/v1/auth/${authMode}`,{method:"POST",body:JSON.stringify(body)});setCurrent(result)}catch(e){setError(message(e))}}
 async function logout(){try{await client.request("/api/v1/auth/logout",{method:"POST"})}finally{endSession()}}
 if(booting)return <main className="center"><div className="spinner"/><p>Restoring your workspace…</p></main>;
 if(!current)return <main className="auth-shell"><section className="brand"><span className="logo">G</span><h1>Gexor</h1><p>Your private, provider-independent AI workspace.</p></section><section className="auth-card"><div className="tabs"><button className={authMode==="login"?"active":""} onClick={()=>setAuthMode("login")}>Log in</button><button className={authMode==="register"?"active":""} onClick={()=>setAuthMode("register")}>Create account</button></div><form onSubmit={authenticate}>{authMode==="register"&&<label>Name<input name="displayName" required minLength={2} maxLength={80} autoComplete="name"/></label>}<label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" required minLength={12} autoComplete={authMode==="login"?"current-password":"new-password"}/></label>{authMode==="register"&&<small>Use at least 12 characters. A longer passphrase is easier to remember and safer.</small>}{error&&<p className="error" role="alert">{error}</p>}<button className="primary" type="submit">{authMode==="login"?"Log in":"Create workspace"}</button></form></section></main>;
 return workspaceView==="settings"?<div className="app-shell"><header><button onClick={()=>setWorkspaceView("chat")}>← Chat</button><button onClick={logout}>Log out</button></header><ProviderSettings client={client} workspaceId={current.workspace.workspaceId}/></div>:<ProductionWorkspace current={current} client={client} logout={logout} openProviders={()=>setWorkspaceView("settings")}/>;
}
function message(e:unknown){return e instanceof Error?e.message:"Something went wrong. Please try again."}
