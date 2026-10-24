const {test}=require('node:test'),assert=require('node:assert/strict');
const {configFrom,nextSync,makeClient,synchronize}=require('../../cloud/lms/sync.cjs');
const {fields,decode}=require('../lib/firestore-values.cjs');
const stamp='2026-10-25T00:08:00.000Z';
const config={project:'orvyn-test',uid:'alice',source_id:'a'.repeat(40),api_token:'b'.repeat(32),calendar_url:'https://lms.telkomuniversity.ac.id/calendar/export_execute.php?userid=42&authtoken='+ 'c'.repeat(32)+'&preset_what=all&preset_time=recentupcoming'};
const state=()=>({collections:{tasks:[{id:'personal',status:'pending',priority:'critical',duration_minutes:90}],academic_tasks:[],living_expenses:[{id:'e',amount:10000}]},preferences:{lms_import:{source_id:config.source_id,enabled:true,seen_ids:[]}}});
const doc=value=>({fields:fields({owner_uid:'alice',version:1,payload:JSON.stringify(value)}),updateTime:stamp});
const snapshot=()=>({calendar:{status:{connected:true},tasks:[]},results:{state:'connected',checked_at:stamp,checked_courses:[],assessments:[]}});
function harness(options={}){const requests=[],writes=[],source=options.state||state();let n=0,calls=0;const collector=async()=>{calls++;return snapshot()};return{source,requests,writes,collector,get calls(){return calls},fetch:async(url,request)=>{
 requests.push({url,...request});
 if(url.endsWith(':commit')){writes.push(JSON.parse(request.body));return{ok:true,status:options.conflict&&++n===1?409:200};}
 const name=url.split('/documents/')[1];
 const payload=name==='spark_users/alice'?doc(options.onRetry&&n?options.onRetry:source):name==='lms_control/alice'?{fields:fields({request_id:'request-1'})}:name==='lms_status/alice'?{fields:fields({last_synced_at:stamp})}:null;
 return{ok:!!payload,status:payload?200:404,json:async()=>payload};
 }};}
const run=h=>synchronize({config,token:'short-lived-identity-credential',fetch:h.fetch,collector:h.collector,clock:()=>new Date(stamp)});
test('validates calendar destination and config without allowing another service or arbitrary URL',()=>{
 assert.equal(configFrom(config).uid,'alice');for(const patch of [{project:'bad/other'},{uid:'../bob'},{api_token:'x'},{calendar_url:'https://attacker.test/?token=secret'},{calendar_url:config.calendar_url+'&redirect=https://attacker.test'}])assert.throws(()=>configFrom({...config,...patch}));
});
test('uses cron minutes 7,22,37,52 including hour and day boundaries',()=>{
 assert.equal(nextSync('2026-10-25T00:07:00Z'),'2026-10-25T00:22:00.000Z');assert.equal(nextSync('2026-10-25T23:59:00Z'),'2026-10-26T00:07:00.000Z');
});
test('cloud transport refuses cross-user reads and writes before requesting Firebase',async()=>{
 let calls=0;const c=makeClient(config,'short-lived-identity-credential',async()=>{calls++});
 await assert.rejects(c.call(c.base+'/spark_users/bob'));await assert.rejects(c.call(c.base+':commit','POST',{writes:[{update:{name:'projects/orvyn-test/databases/(default)/documents/spark_users/bob'}}]}));assert.equal(calls,0);
});
test('publishes cloud heartbeat with the account revision; personal progress and finance stay intact',async()=>{
 const h=harness(),result=await run(h);assert.equal(result.state,'connected');assert.equal(result.interval_seconds,900);assert.equal(h.calls,1);
 const update=h.writes[0].writes.find(w=>w.update.name.endsWith('/lms_status/alice')).update;
 const status=Object.fromEntries(Object.entries(update.fields).map(([k,v])=>[k,decode(v)]));assert.equal(status.mode,'github_actions');assert.equal(status.next_sync_at,'2026-10-25T00:22:00.000Z');assert.equal(status.last_request_result,'success');
 const account=h.writes[0].writes.find(w=>w.update.name.endsWith('/spark_users/alice'));const value=JSON.parse(decode(account.update.fields.payload));assert.deepEqual(value.collections.tasks,h.source.collections.tasks);assert.deepEqual(value.collections.living_expenses,h.source.collections.living_expenses);assert.equal(account.currentDocument.updateTime,stamp);
});
test('paused integration never contacts Moodle, and still acknowledges a queued request as paused',async()=>{
 const s=state();s.preferences.lms_import.enabled=false;const h=harness({state:s});const result=await run(h);assert.equal(result.state,'paused');assert.equal(h.calls,0);const status=h.writes[0].writes.at(-1).update.fields;assert.equal(decode(status.last_request_result),'paused');
});
test('dry run can verify cloud access and collection without writing data or status',async()=>{
 const h=harness();const result=await synchronize({config,token:'short-lived-identity-credential',fetch:h.fetch,collector:h.collector,dryRun:true,clock:()=>new Date(stamp)});assert(result.dry_run);assert.equal(h.writes.length,0);assert.equal(h.calls,1);
});
test('a concurrent pause is respected after compare-and-set failure without re-fetching LMS',async()=>{
 const paused=state();paused.preferences.lms_import.enabled=false;const h=harness({conflict:true,onRetry:paused});const r=await run(h);assert.equal(r.state,'paused');assert.equal(h.calls,1);assert.equal(h.writes.length,2);
});
test('wrong owner/source or account deletion cannot send LMS credentials or write account data',async()=>{
 for(const patch of [{deletion_pending:true},{preferences:{lms_import:{source_id:'other',enabled:true,seen_ids:[]}}}]){const h=harness({state:{...state(),...patch}});await assert.rejects(run(h));assert.equal(h.calls,0);assert.equal(h.writes.length,0);}
});
test('a changed assessment is backed up atomically while unrelated records remain intact',async()=>{
 const h=harness();h.collector=async()=>({calendar:{status:{connected:true},tasks:[]},results:{state:'connected',checked_at:stamp,checked_courses:[9],assessments:[{key:'activity-9-12',course_id:9,course_name:'Test',course_code:'TEST',module_id:12,grade_item_id:15,kind:'assignment',title:'Assignment',url:'https://lms.telkomuniversity.ac.id/mod/assign/view.php?id=12',submission_status:'submitted',grading_status:'graded',grade:0,grade_max:100,grade_display:'0',submitted_at:null,graded_at:null,checked_at:stamp}]}});
 const r=await run(h);assert.equal(r.assessments,1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].writes.length,3);
 const backup=h.writes[0].writes.find(w=>w.update.name.endsWith('/lms_cloud_backups/alice'));assert.equal(decode(backup.update.fields.payload),JSON.stringify(h.source));
 const updated=JSON.parse(decode(h.writes[0].writes.find(w=>w.update.name.endsWith('/spark_users/alice')).update.fields.payload));assert.equal(updated.collections.lms_assessments[0].grade,0);assert.deepEqual(updated.collections.living_expenses,h.source.collections.living_expenses);
});
test('provider failure preserves existing results and cannot acknowledge success',async()=>{
 const s=state();s.collections.lms_assessments=[{id:'old',title:'Saved grade'}];const h=harness({state:s});h.collector=async()=>({calendar:{status:{connected:false},tasks:[]},results:{state:'error',assessments:[]}});
 assert.equal((await run(h)).state,'error');const status=h.writes[0].writes.at(-1).update.fields;assert.equal(decode(status.last_request_result),'error');
 const saved=JSON.parse(decode(h.writes[0].writes.find(w=>w.update.name.endsWith('/spark_users/alice')).update.fields.payload));assert.deepEqual(saved.collections.lms_assessments,s.collections.lms_assessments);
});
test('repeated account conflicts are bounded and do not recollect from Moodle',async()=>{
 const h=harness(),fetch=h.fetch;let conflicts=0;
 h.fetch=async(url,r)=>url.endsWith(':commit')?(conflicts++,{ok:false,status:409}):fetch(url,r);
 await assert.rejects(run(h),/bersamaan/);assert.equal(conflicts,5);assert.equal(h.calls,1);
});
