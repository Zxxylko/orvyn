const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const {mergeLms,hash}=require('../../scripts/lib/lms-spark.cjs');
const {mergeResults}=require('../../scripts/lib/lms-results.cjs');
const {fields,decode}=require('../../scripts/lib/firestore-values.cjs');
const INTERVAL=900;
function configFrom(value){
 let c;try{c=typeof value==='string'?JSON.parse(value):value;}catch{throw Error('Konfigurasi sinkronisasi cloud tidak valid.');}
 if(!c||!/^[a-z][a-z0-9-]{4,61}$/.test(c.project)||!/^[A-Za-z0-9_-]{1,128}$/.test(c.uid)||!/^[a-f0-9]{40}$/.test(c.source_id)||!/^[A-Za-z0-9_-]{32,128}$/.test(c.api_token))throw Error('Identitas sinkronisasi cloud tidak valid.');
 let url;try{url=new URL(c.calendar_url);}catch{throw Error('Kalender cloud tidak valid.');}
 const names=['userid','username','authtoken','preset_what','preset_time'];
 if(url.origin!=='https://lms.telkomuniversity.ac.id'||url.pathname!=='/calendar/export_execute.php'||url.hash||url.username||url.password||[...url.searchParams.keys()].some(k=>!names.includes(k))||!/^[1-9][0-9]*$/.test(url.searchParams.get('userid')||'')||!/^[A-Za-z0-9]{20,128}$/.test(url.searchParams.get('authtoken')||'')||url.searchParams.get('preset_what')!=='all'||url.searchParams.get('preset_time')!=='recentupcoming')throw Error('Kalender cloud tidak diizinkan.');
 return {project:c.project,uid:c.uid,source_id:c.source_id,calendar_url:url.href,api_token:c.api_token};
}
function nextSync(at){const minute=60000,start=Date.parse(at);let n=Math.floor(start/minute)*minute+minute;while(new Date(n).getUTCMinutes()%15!==7)n+=minute;return new Date(n).toISOString();}
function makeClient(c,token,fetch=globalThis.fetch){
 if(typeof token!=='string'||token.length<20)throw Error('Identitas cloud belum tersedia.');
 const base=`https://firestore.googleapis.com/v1/projects/${c.project}/databases/(default)/documents`;
 const names=Object.fromEntries(['spark_users','lms_status','lms_control','lms_cloud_backups'].map(k=>[k,`projects/${c.project}/databases/(default)/documents/${k}/${c.uid}`]));
 const allowed=new Set(Object.values(names).map(n=>'https://firestore.googleapis.com/v1/'+n));
 async function call(url,method='GET',body){
  if(!allowed.has(url)&&url!==base+':commit')throw Error('Tujuan sinkronisasi tidak diizinkan.');
  if(method!=='GET'&&(url!==base+':commit'||!Array.isArray(body?.writes)||body.writes.length>3||body.writes.some(w=>!Object.values(names).filter(n=>!n.includes('/lms_control/')).includes(w.update?.name))))throw Error('Penulisan cloud di luar akun ditolak.');
  for(let n=0;n<2;n++){
   let r;try{r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{if(n===1)throw Error('Firebase belum dapat dijangkau.');continue;}
   if([429,500,502,503,504].includes(r.status)&&n===0)continue;return r;
  }
 }
 return {base,names,call,async read(name){const r=await call('https://firestore.googleapis.com/v1/'+names[name]);if(r.status===404)return null;if(!r.ok)throw Error('Data akun belum dapat dibaca.');return r.json();}};
}
const values=doc=>Object.fromEntries(Object.entries(doc?.fields||{}).map(([k,v])=>[k,decode(v)]));
function accountState(doc,c){
 const data=values(doc);if(data.owner_uid!==c.uid||data.version!==1||typeof data.payload!=='string')throw Error('Pemilik data tidak cocok.');
 let state;try{state=JSON.parse(data.payload);}catch{throw Error('Format data akun tidak valid.');}
 if(state.deletion_pending||!state.collections||state.preferences?.lms_import?.source_id!==c.source_id)throw Error('Sumber LMS berubah atau akun tidak aktif.');return state;
}
async function collect(c){
 const out=await promisify(execFile)(process.env.PHP_BINARY||'php',[path.join(__dirname,'collect.php')],{cwd:__dirname,encoding:'utf8',timeout:145000,maxBuffer:5*1024*1024,env:{PATH:process.env.PATH,ORVYN_LMS_CONFIG:JSON.stringify(c)}});
 try{return JSON.parse(out.stdout);}catch{throw Error('Hasil LMS tidak dapat dibaca.');}
}
async function synchronize({config,token,fetch,collector=collect,dryRun=false,clock=()=>new Date(),runUrl=null}){
 const c=configFrom(config),client=makeClient(c,token,fetch);
 const [first,statusDoc,controlDoc]=await Promise.all([client.read('spark_users'),client.read('lms_status'),client.read('lms_control')]);
 const initial=accountState(first,c),oldStatus=values(statusDoc),control=values(controlDoc);
 const active=initial.preferences.lms_import.enabled;
 // Never contact Moodle when the user has paused the integration.
 let snapshot=active?await collector(c):null;
 if(snapshot&&(!snapshot.calendar?.status||!Array.isArray(snapshot.calendar.tasks)||!snapshot.results))throw Error('Snapshot LMS tidak lengkap.');
 const stamp=clock().toISOString();
 for(let attempt=0;attempt<5;attempt++){
  const doc=attempt?await client.read('spark_users'):first,state=accountState(doc,c),enabled=state.preferences.lms_import.enabled;
  const calendar=enabled&&snapshot?snapshot.calendar:{status:{connected:false},tasks:[]};
  const result=enabled&&snapshot?snapshot.results:{state:'paused',assessments:[]};
  const merged=mergeLms(state,c.uid,c.source_id,calendar,false,stamp);
  const final=enabled?mergeResults(merged.state,c.uid,c.source_id,result,new Date(stamp)):{state:merged.state,count:(state.collections.lms_assessments||[]).filter(r=>!r.missing_since).length};
  const success=calendar.status.connected&&['connected','partial'].includes(result.state);
  const status={...oldStatus,mode:'github_actions',enabled,connected:enabled&&calendar.status.connected,source_state:!enabled?'disconnected':calendar.status.connected?'connected':'error',last_attempt_at:stamp,last_synced_at:calendar.status.connected?stamp:oldStatus.last_synced_at||null,last_heartbeat_at:stamp,last_cloud_synced_at:stamp,next_sync_at:nextSync(stamp),sync_interval_seconds:INTERVAL,imported_count:merged.count,scope:'new_this_week',last_error:!enabled||calendar.status.connected?null:'Kalender LMS belum dapat diperbarui. Data terakhir tetap tersimpan.',revision:hash(JSON.stringify(final.state)),assessment_state:result.state,assessment_count:final.count||0,assessment_last_synced_at:['connected','partial'].includes(result.state)?result.checked_at:oldStatus.assessment_last_synced_at||null,assessment_error:result.state==='error'?'Status dan nilai LMS belum dapat diperbarui. Periksa akses API akun.':result.state==='partial'?'Sebagian hasil LMS belum dapat diperiksa. Data terakhir tetap tersedia.':null};
  if(runUrl&&/^https:\/\/github\.com\/Zxxylko\/orvyn\/actions\/runs\/\d+$/.test(runUrl))status.cloud_run_url=runUrl;
  if(control.request_id&&control.request_id!==oldStatus.last_request_id)Object.assign(status,{last_request_id:control.request_id,last_request_result:!enabled?'paused':success?'success':'error',last_request_at:stamp});
  const summary={state:!enabled?'paused':success?'connected':'error',assessments:final.count||0,created:merged.created,updated:merged.updated,interval_seconds:INTERVAL,dry_run:dryRun,calendar_connected:Boolean(calendar.status.connected),assessment_state:result.state,checked_courses:result.checked_courses?.length||0,requests:result.requests||0,diagnostics:snapshot?.diagnostics||null};
  if(dryRun)return summary;
  const payload=JSON.stringify(final.state),changed=payload!==doc.fields.payload.stringValue;
  const writes=[];
  if(changed){
   writes.push({update:{name:client.names.lms_cloud_backups,fields:fields({owner_uid:c.uid,payload:doc.fields.payload.stringValue,saved_at:stamp})}});
   writes.push({update:{name:client.names.spark_users,fields:fields({owner_uid:c.uid,version:1,payload})},currentDocument:{updateTime:doc.updateTime},updateTransforms:[{fieldPath:'updated_at',setToServerValue:'REQUEST_TIME'}]});
  } else writes.push({update:{name:client.names.spark_users,fields:doc.fields},currentDocument:{updateTime:doc.updateTime}});
  // A compare-and-set on account state also protects a concurrent pause/deletion.
  writes.push({update:{name:client.names.lms_status,fields:fields(status)}});
  const response=await client.call(client.base+':commit','POST',{writes});
  if([409,412].includes(response.status))continue;
  if(!response.ok)throw Error('Hasil sinkronisasi belum tersimpan.');
  return summary;
 }
 throw Error('Data akun berubah bersamaan. Coba lagi pada jadwal berikutnya.');
}
if(require.main===module){
 if(process.env.GITHUB_ACTIONS==='true'){try{const c=configFrom(process.env.ORVYN_LMS_CONFIG);for(const secret of [c.api_token,c.calendar_url,new URL(c.calendar_url).searchParams.get('authtoken')])console.log('::add-mask::'+secret);}catch{}}
 synchronize({config:process.env.ORVYN_LMS_CONFIG,token:process.env.GCP_ACCESS_TOKEN,dryRun:process.env.LMS_DRY_RUN==='true',runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null}).then(value=>{console.log(JSON.stringify(value));if(value.state==='error')process.exitCode=1;}).catch(()=>{console.error('Sinkronisasi cloud belum berhasil. Data terakhir tetap tersimpan; periksa izin akun dan status LMS.');process.exitCode=1;});
}
module.exports={configFrom,nextSync,makeClient,synchronize,accountState};
