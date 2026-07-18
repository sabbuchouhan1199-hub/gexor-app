import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { loadApiConfig } from "../config.js";

const config=loadApiConfig();
if(config.databasePath===":memory:")throw new Error("Backups require a file-backed SQLite database.");
const sourcePath=resolve(config.databasePath);const root=resolve(process.env.GEXOR_BACKUP_PATH?.trim()||".data/backups");
if(root==="/"||root===resolve("."))throw new Error("GEXOR_BACKUP_PATH must be a dedicated directory.");
mkdirSync(root,{recursive:true});
const timestamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/, "Z");
const destination=join(root,`gexor-${timestamp}.sqlite`);const source=new DatabaseSync(sourcePath,{readOnly:true});
try{await backup(source,destination);}finally{source.close()}
const retention=readPositive(process.env.GEXOR_BACKUP_RETENTION,"7");
const candidates=readdirSync(root).filter(name=>/^gexor-\d{8}T\d{6}Z[.]sqlite$/.test(name)).map(name=>({name,time:statSync(join(root,name)).mtimeMs})).sort((left,right)=>right.time-left.time);
for(const candidate of candidates.slice(retention)){const target=join(root,basename(candidate.name));if(target.startsWith(`${root}/`))unlinkSync(target)}
console.log(JSON.stringify({event:"backup.completed",path:destination,retention}));
function readPositive(value:string|undefined,fallback:string){const raw=value?.trim()||fallback;if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>365)throw new Error("GEXOR_BACKUP_RETENTION must be between 1 and 365.");return Number(raw)}
