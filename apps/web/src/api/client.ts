import type { ApiProblem } from "@gexor/contracts";

export class ApiError extends Error { constructor(message:string, readonly status:number, readonly code?:string, readonly retryable=false){super(message)} }
export class ApiClient {
  constructor(private token?:string, private workspaceId?:string) {}
  async request<T>(path:string, init:RequestInit={}):Promise<T>{
    const response=await fetch(path,{...init,cache:"no-store",headers:{...(init.body?{"Content-Type":"application/json"}:{}),...(this.token?{Authorization:`Bearer ${this.token}`}:{ }),...(this.workspaceId?{"X-Workspace-Id":this.workspaceId}:{}),...init.headers}});
    if(response.status===204) return undefined as T;
    const body:unknown=await response.json().catch(()=>undefined);
    if(!response.ok){const p=body as Partial<ApiProblem>|undefined; throw new ApiError(p?.detail?.trim()||`Request failed (${response.status}).`,response.status,p?.code,p?.retryable)}
    return body as T;
  }
}
