const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normal = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('id');
function validResult(row) {
  if (!row || !/^((activity|grade)-\d+-\d+)$/.test(row.key) || !Number.isSafeInteger(row.course_id) || row.course_id <= 0 ||
    !['assignment', 'quiz', 'manual'].includes(row.kind) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 255 ||
    typeof row.course_name !== 'string' || !row.course_name.trim() || row.course_name.length > 160 || typeof row.course_code !== 'string' || row.course_code.length > 100 ||
    !['unknown', 'not_submitted', 'draft', 'submitted', 'in_progress', 'finished'].includes(row.submission_status) ||
    !['graded', 'ungraded', 'hidden'].includes(row.grading_status) || !Number.isFinite(Date.parse(row.checked_at))) throw Error('Format hasil LMS tidak valid.');
  for (const key of ['module_id', 'grade_item_id']) if (row[key] !== null && (!Number.isSafeInteger(row[key]) || row[key] <= 0)) throw Error('Identitas hasil LMS tidak valid.');
  for (const key of ['grade', 'grade_max']) if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || Math.abs(row[key]) > 1e9)) throw Error('Nilai LMS tidak valid.');
  if (row.grading_status !== 'graded' && row.grade !== null || row.grading_status === 'graded' && row.grade === null) throw Error('Status nilai LMS tidak konsisten.');
  if (row.grade_display !== null && (typeof row.grade_display !== 'string' || row.grade_display.length > 100) || row.grading_status === 'hidden' && (row.grade_display !== null || row.graded_at !== null)) throw Error('Nilai tersembunyi tidak boleh disalin.');
  for (const key of ['submitted_at', 'graded_at']) if (row[key] !== null && !Number.isFinite(Date.parse(row[key]))) throw Error('Tanggal hasil LMS tidak valid.');
  if (row.kind === 'manual' ? row.module_id !== null || row.url !== null :
    row.url !== `https://lms.telkomuniversity.ac.id/mod/${row.kind === 'quiz' ? 'quiz' : 'assign'}/view.php?id=${row.module_id}`) throw Error('Tautan hasil LMS tidak valid.');
  const expectedKey = row.kind === 'manual' ? `grade-${row.course_id}-${row.grade_item_id}` : `activity-${row.course_id}-${row.module_id}`;
  if (row.key !== expectedKey) throw Error('Identitas hasil LMS tidak konsisten.');
  return Object.fromEntries(['key','course_id','course_name','course_code','module_id','grade_item_id','kind','title','url','submission_status','grading_status','grade','grade_max','grade_display','submitted_at','graded_at','checked_at'].map(k => [k, row[k]]));
}
function mergeResults(input, uid, sourceId, snapshot, now = new Date()) {
  const state = structuredClone(input);
  if (state?.deletion_pending || !state?.collections || !state?.preferences || state.preferences.lms_import?.source_id !== sourceId) throw Error('Sumber hasil LMS berbeda.');
  if (!state.preferences.lms_import.enabled || !['connected','partial'].includes(snapshot.state)) return { state, changed: false, count: (state.collections.lms_assessments || []).length };
  if (!Array.isArray(snapshot.assessments) || snapshot.assessments.length > 1000 || !Array.isArray(snapshot.checked_courses) || snapshot.checked_courses.some(n => !Number.isSafeInteger(n) || n <= 0)) throw Error('Ukuran hasil LMS tidak valid.');
  const incoming = snapshot.assessments.map(validResult), keys = new Set();
  for (const row of incoming) { if (keys.has(row.key) || !snapshot.checked_courses.includes(row.course_id)) throw Error('Hasil LMS duplikat atau mata kuliah belum diverifikasi.'); keys.add(row.key); }
  const current = state.collections.lms_assessments ||= [], seen = new Set(), stamp = now.toISOString();
  for (const value of incoming) {
    const id = `lms-result-${hash(`${uid}/${sourceId}/${value.key}`)}`; seen.add(id);
    const old = current.find(r => r.id === id), row = { ...value, lms_source_id: sourceId, missing_since: null };
    if (old) Object.assign(old, row, { updated_at: stamp });
    else current.push({ ...row, id, user_id: uid, created_at: stamp, updated_at: stamp });
  }
  for (const old of current) if (old.lms_source_id === sourceId && snapshot.checked_courses.includes(old.course_id) && !seen.has(old.id)) old.missing_since ||= stamp;
  const academic = state.collections.academic_tasks || [];
  const available = current.filter(r => r.lms_source_id === sourceId && !r.missing_since);
  const tasks = state.collections.tasks || [];
  for (const row of academic.filter(a => a.lms_source_id === sourceId)) {
    const candidates = available.filter(r => r.kind === row.task_type && (r.url === row.lms_url ||
      r.course_code && row.course_code && normal(r.course_code) === normal(row.course_code) && normal(r.title) === normal(row.title)));
    const unique = candidates.length === 1 && academic.filter(a => a.lms_source_id === sourceId && a.task_type === candidates[0].kind &&
      (a.lms_url === candidates[0].url || a.course_code && candidates[0].course_code && normal(a.course_code) === normal(candidates[0].course_code) && normal(a.title) === normal(candidates[0].title))).length === 1;
    const result = unique ? candidates[0] : null;
    if (result) {
      // Verified metadata only. Personal completion, deadlines and focus estimates remain untouched.
      row.lms_result_id = result.id;
      row.lms_submission_status = result.submission_status;
      const mirror = tasks.find(t => t.id === row.mirrored_task_id);
      if (mirror) { mirror.lms_result_id = result.id; mirror.lms_submission_status = result.submission_status; }
    } else {
      delete row.lms_result_id; delete row.lms_submission_status;
      const mirror = tasks.find(t => t.id === row.mirrored_task_id); if (mirror) { delete mirror.lms_result_id; delete mirror.lms_submission_status; }
    }
  }
  if (Buffer.byteLength(JSON.stringify(state)) > 650000) throw Error('Data akun Spark melebihi kapasitas. Data lama tetap tersimpan.');
  return { state, changed: !same(input, state), count: available.length };
}

/** One background request at most; calendar/control polling is never blocked by grade collection. */
function createResultsSync({ collect, commit, report = () => {}, clock = Date.now, interval = 300000 }) {
  let next = 0, running = null;
  const schedule = (enabled, force = false) => {
    if (!enabled || running || !force && clock() < next) return running;
    next = clock() + interval;
    report({ assessment_state: 'syncing' });
    running = (async () => {
      try {
        const snapshot = await collect();
        if (!['connected','partial'].includes(snapshot.state)) {
          report({ assessment_state: snapshot.state === 'not_configured' ? 'not_configured' : 'error', assessment_error: snapshot.error || null }); return;
        }
        const result = await commit(snapshot);
        if (result.paused) { report({ assessment_state: 'paused' }); return; }
        report({ assessment_state: snapshot.state, assessment_last_synced_at: snapshot.checked_at, assessment_count: result.count, assessment_error: snapshot.state === 'partial' ? 'Sebagian mata kuliah belum dapat diperiksa. Data terakhir tetap tersedia.' : null });
      } catch { report({ assessment_state: 'error', assessment_error: 'Status dan nilai belum dapat diperbarui. Data terakhir tetap tersimpan.' }); }
      finally { running = null; }
    })();
    return running;
  };
  return { schedule };
}
module.exports = { validResult, mergeResults, createResultsSync };
