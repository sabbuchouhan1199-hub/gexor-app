import type { ApiProblem, ExecutionStreamEvent } from "@gexor/contracts";

export class ApiError extends Error { constructor(message:string, readonly status:number, readonly code?:string, readonly retryable=false){super(message)} }
function csrfToken(){const match=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith("gexor_csrf="));return match?decodeURIComponent(match.slice("gexor_csrf=".length)):undefined}
export class ApiClient {
  constructor(private workspaceId?:string) {}
  async request<T>(path:string, init:RequestInit={}):Promise<T>{
    const unsafe=Boolean(init.method&&!['GET','HEAD','OPTIONS'].includes(init.method.toUpperCase()));
    const csrf=unsafe?csrfToken():undefined;
    const response=await fetch(path,{...init,credentials:"same-origin",cache:"no-store",headers:{...(typeof init.body==="string"?{"Content-Type":"application/json"}:{}),...(this.workspaceId?{"X-Workspace-Id":this.workspaceId}:{}),...(csrf?{"X-CSRF-Token":csrf}:{}),...init.headers}});
    if(response.status===204) return undefined as T;
    const body:unknown=await response.json().catch(()=>undefined);
    if(!response.ok){const p=body as Partial<ApiProblem>|undefined; throw new ApiError(p?.detail?.trim()||`Request failed (${response.status}).`,response.status,p?.code,p?.retryable)}
    return body as T;
  }
  async streamExecution(executionId:string,onEvent:(event:ExecutionStreamEvent)=>void,signal:AbortSignal):Promise<void>{
    let cursor=0;let attempts=0;const seen=new Set<string>();
    while(!signal.aborted&&attempts<7){
      let response:Response;
      try{response=await fetch(`/api/v1/executions/${executionId}/events?after=${cursor}`,{credentials:"same-origin",cache:"no-store",signal,headers:{Accept:"text/event-stream",...(this.workspaceId?{"X-Workspace-Id":this.workspaceId}:{})}})}catch(error){if(signal.aborted)throw error;attempts++;await delay(Math.min(8000,250*2**attempts)+Math.random()*200);continue}
      if(response.status===401||response.status===403)throw new ApiError("Your session is no longer authorized. Sign in again.",response.status,"AUTHENTICATION_REQUIRED");
      if(!response.ok||!response.body){attempts++;await delay(Math.min(8000,250*2**attempts));continue}
      attempts=0;const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
      while(!signal.aborted){
        const item=await reader.read();buffer+=decoder.decode(item.value,{stream:!item.done});const frames=buffer.split("\n\n");buffer=item.done?"":frames.pop()??"";
        for(const frame of frames){const data=frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).join("");if(!data)continue;let value:unknown;try{value=JSON.parse(data)}catch{continue}
          if(!isExecutionEvent(value)||seen.has(value.eventId)||value.sequence<=cursor)continue;seen.add(value.eventId);cursor=value.sequence;onEvent(value);
          if(["response.completed","execution.cancelled","execution.failed","execution.timed_out"].includes(value.eventType))return;
        }
        if(item.done)break;
      }
      if(!signal.aborted){attempts++;await delay(Math.min(8000,250*2**attempts)+Math.random()*200)}
    }
    if(!signal.aborted)throw new ApiError("The live response connection could not be restored.",0,"PROVIDER_UNAVAILABLE",true);
  }
}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function isExecutionEvent(value:unknown):value is ExecutionStreamEvent{return typeof value==="object"&&value!==null&&typeof (value as ExecutionStreamEvent).eventId==="string"&&typeof (value as ExecutionStreamEvent).sequence==="number"&&typeof (value as ExecutionStreamEvent).eventType==="string"}
