const KEY="gexor.session";
export const sessionStorage={load:()=>window.localStorage.getItem(KEY)??undefined,save:(token:string)=>window.localStorage.setItem(KEY,token),clear:()=>window.localStorage.removeItem(KEY)};
