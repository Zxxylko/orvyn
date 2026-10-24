const { wibWeek, inWibWeek } = require('./lms-week.cjs');
const { createHash } = require('node:crypto');
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 40);
const copy = value => structuredClone(value);
function mergeLms(stateInput, uid, sourceId, snapshot, initializing = false, now = new Date()) {
  const state = copy(stateInput);
  if (!state || typeof state !== 'object' || !state.collections || Array.isArray(state.collections) || !state.preferences || Array.isArray(state.preferences) || Object.values(state.collections).some(v => !Array.isArray(v)) || state.deletion_pending)
    throw new Error('Data cloud tidak valid atau akun nonaktif; data tidak ditimpa.');
  const week = wibWeek(now);
  const weeklyCount = () => (state.collections.academic_tasks || []).filter(r => r.lms_source_id === sourceId && !r.lms_missing_since && inWibWeek(r.lms_created_at || (!r.lms_baseline && r.lms_first_seen_at), week)).length;
  let settings = state.preferences.lms_import;
  if (!settings) {
    if (!initializing) throw new Error('Penghubung belum dipasangkan. Jalankan --init sekali.');
    settings = state.preferences.lms_import = { source_id: sourceId, enabled: true, seen_ids: [] };
  }
  if (settings.source_id !== sourceId || !Array.isArray(settings.seen_ids) || settings.seen_ids.length > 2000)
    throw new Error('Sumber LMS berbeda atau marker tidak valid; data tidak ditimpa.');
  if (!settings.enabled || !snapshot.status.connected) return { state, connected: false, count: weeklyCount(), created: 0, updated: 0 };
  if (!Array.isArray(snapshot.tasks) || snapshot.tasks.length > 2000) throw new Error('Snapshot LMS terlalu besar.');
  settings.scope = 'new_this_week';
  const seen = new Set(settings.seen_ids);
  const incoming = new Set();
  const academics = state.collections.academic_tasks ||= [];
  const tasks = state.collections.tasks ||= [];
  let created = 0, updated = 0;
  const stamp = new Date(now).toISOString();
  for (const source of snapshot.tasks) {
    if (typeof source.lms_uid !== 'string' || source.lms_uid.length > 255 || !['quiz','assignment'].includes(source.task_type) || !Number.isFinite(Date.parse(source.deadline)))
      throw new Error('Deadline LMS tidak valid.');
    const key = hash(`${uid}/${sourceId}/${source.lms_uid}`);
    const id = `lms-${key}`, mirrorId = `lms-task-${key}`;
    incoming.add(id);
    const old = academics.find(r => r.id === id);
    // Import the whole feed. Weekly discovery is independent of the deadline.
    if (!old && source.lms_missing_since) continue;
    // Once imported, an absent row represents a user deletion, including after trash was purged.
    if (!old && seen.has(key)) continue;
    const text = (v,n) => typeof v === 'string' ? v.slice(0,n) : '';
    if (!/^https:\/\/lms\.telkomuniversity\.ac\.id\/(calendar\/view\.php\?|mod\/(assign|quiz)\/view\.php\?id=)/.test(source.lms_url || '')) throw new Error('Tautan kegiatan LMS tidak valid.');
    const value = {
      course_name:text(source.course_name,100), title:text(source.title,255), description:text(source.description,10000) || null,
      course_code:source.course_code === undefined ? (old?.course_code ?? null) : (text(source.course_code,100) || null),
      task_type:source.task_type, deadline:new Date(source.deadline).toISOString(), lms_url:source.lms_url,
      lms_uid:source.lms_uid, lms_source_id:sourceId, lms_missing_since:source.lms_missing_since || null,
      lms_created_at:source.lms_created_at || old?.lms_created_at || null,
      lms_first_seen_at:old?.lms_first_seen_at || source.lms_first_seen_at || old?.created_at || stamp,
      lms_baseline:typeof old?.lms_baseline === 'boolean' ? old.lms_baseline : typeof source.lms_baseline === 'boolean' ? source.lms_baseline : initializing || Boolean(old),
    };
    for (const key of ['lms_created_at', 'lms_first_seen_at']) if (value[key] && !Number.isFinite(Date.parse(value[key]))) throw new Error('Tanggal penemuan LMS tidak valid.');
    if (!value.title.trim() || !value.course_name.trim()) throw new Error('Nama tugas LMS tidak valid.');
    const changed = !old || Object.entries(value).some(([k,v]) => old[k] !== v);
    let academic = old;
    if (!old) {
      academic = {...value,id,user_id:uid,status:'todo',mirrored_task_id:mirrorId,created_at:stamp,updated_at:stamp};
      academics.push(academic); created++;
    } else if (changed) { Object.assign(old,value,{updated_at:stamp}); updated++; }
    seen.add(key);
    const linkedId = academic.mirrored_task_id;
    const mirror = tasks.find(r => r.id === linkedId);
    const mirrorValues = {title:`[${value.course_name}] ${value.title}`.slice(0,255),description:`${value.description || ''}\nLMS: ${value.lms_url}`.slice(0,10000),deadline:value.deadline};
    if (!mirror) {
      tasks.push({...mirrorValues,id:linkedId,user_id:uid,status:academic.status==='todo'?'pending':academic.status,priority:'high',duration_minutes:60,difficulty:3,category:'theory',tags:['lms'],completed_at:academic.status==='completed'?stamp:null,created_at:stamp,updated_at:stamp});
    } else if (changed) Object.assign(mirror,mirrorValues,{updated_at:stamp});
  }
  for (const old of academics) if (old.lms_source_id === sourceId && !incoming.has(old.id) && !old.lms_missing_since) { old.lms_missing_since=stamp; old.updated_at=stamp; updated++; }
  if (seen.size > 2000) throw new Error('Kapasitas marker LMS penuh; ekspor dan periksa data.');
  settings.seen_ids=[...seen];
  if (Buffer.byteLength(JSON.stringify(state),'utf8') > 650000) throw new Error('Kapasitas akun Spark 650 KB penuh; data tidak ditimpa.');
  return {state,connected:true,count:weeklyCount(),created,updated};
}
module.exports = {mergeLms,hash};
