/* Independent review v2. Legacy keys are read-only; completed rounds are immutable. */
(()=>{
'use strict';
const C=JSON.parse(document.getElementById('review-config').textContent);
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PREFIX='science-review-v2|'+encodeURIComponent(C.quizId)+'|';
const uuid=()=>crypto.randomUUID();
const label={memory:'基础填空',scene:'情境挑战'};
let bank=[],batch=null,mode='memory',r=1,view='home',history=null,client=null,user=null,unlocked=false,busy=false;
let revealed=new Set(), cloudAttempts=[],cloudItems=new Map();
let masteryMeta=null,masteryCloudEvents=[],masteryCloudScope='',masteryCloudLoaded=false;
const app=$('app');
function read(key){const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}
function batches(){const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX)){const b=read(k);if(b?.version===2)out.push(b);}}return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
function persist(b=batch){try{const raw=JSON.stringify(b);localStorage.setItem(PREFIX+b.id,raw);if(localStorage.getItem(PREFIX+b.id)!==raw)throw Error('保存验证失败');return true;}catch(e){alert('保存失败，请先导出备份，暂勿关闭页面：'+e.message);return false;}}
function questions(m=mode){return bank.filter(q=>q.mode===m);}
function roundData(m=mode,n=r,b=batch){return b.rounds[m][n];}
function createBatch(meta,ids=null,reviewPlan=null){
 const b={version:2,id:uuid(),quizId:C.quizId,child:meta.child,semester:meta.semester,stage:meta.stage,createdAt:new Date().toISOString(),questionIds:ids||bank.map(q=>q.id),reviewPlan,rounds:{memory:{},scene:{}}};
 for(const m of ['memory','scene']) b.rounds[m][1]={ids:questions(m).filter(q=>b.questionIds.includes(q.id)).map(q=>q.id),answers:{},skipped:{},ticks:{},graded:false,done:false};
 if(!persist(b))return;
 batch=b;mode=b.rounds.memory[1].ids.length?'memory':'scene';r=1;view='practice';revealed.clear();history=null;render();
}
function openBatch(id){batch=read(PREFIX+id);mode='memory';r=1;view='practice';history=null;revealed.clear();render();}
function required(){const d=roundData();return questions().filter(q=>d.ids.includes(q.id));}
function ready(q,d){return !!d.skipped[q.id]||q.fields.every(f=>String(d.answers[q.id]?.[f]||'').trim());}
function metadata(){const child=$('child').value.trim(),semester=$('term').value.trim(),stage=$('stage').value;if(!child||!semester){alert('请填写孩子姓名和学期。');return null;}return {child,semester,stage};}
function legacyRecords(){
 const records=[];
 const keys=C.air?Object.keys(localStorage).filter(k=>k.startsWith(C.localKey)):[C.localKey];
 for(const key of keys){const s=read(key);if(!s)continue;
 for(const m of ['memory','scene'])for(let n=1;n<=3;n++){
  const p=C.grade===4&&!C.air?(m==='memory'?'m':'s'):m;
  const d=C.air?s.modes?.[m]?.rounds?.[n]:null;
  if(C.air&&!d)continue;
  const items=questions(m).filter(q=>{for(let prev=1;prev<n;prev++){if(C.air){const z=s.modes?.[m]?.rounds?.[prev];if(z?.done&&z.ticks?.[q.id])return false;}else if(s.done?.[p+'-'+prev]&&(s.tick||s.ticks)?.[p+'-'+q.number+'-'+prev])return false;}return true;}).map(q=>{
   let fields={},tick=false,skipped=false;
   if(C.air){fields={answer:d.answers?.[q.id]||''};tick=!!d.ticks?.[q.id];skipped=!!d.skipped?.[q.id];}
   else{for(const [i,f]of q.fields.entries())fields[f]=C.grade===4?(s.values?.[p+'-'+n+'-'+q.legacyFields[i]]||''):(s.draft?.[p+'-'+q.number+'-'+n+'-'+f]||'');tick=!!(s.tick||s.ticks)?.[p+'-'+q.number+'-'+n];}
   const graded=C.air?(d.graded||d.done):(s.done?.[p+'-'+n]||s.graded?.[p+'-'+q.number+'-'+n]);
   return {id:q.id,title:q.title,fields,correct:tick,skipped,expected:graded?q.answer:''};
  });
  const done=C.air?!!d.done:!!s.done?.[p+'-'+n];
  if(done||items.some(x=>x.correct||x.skipped||Object.values(x.fields).some(Boolean)))records.push({id:'legacy|'+key+'|'+m+'|'+n,title:'原有本机记录 · '+label[m]+' · 第'+n+'轮',child:s.name||C.defaultName,semester:C.air?key.slice(C.localKey.length):'原记录未标明',stage:'原有记录',mode:m,round:n,at:C.air?d.finishedAt:null,done,items});
 }}return records;
}
function home(){
 const bs=batches();const olds=legacyRecords();
 app.innerHTML=`<section><h2>开始新一次独立复习</h2><p>新批次有全新三轮。第一轮练全部题目，第二、三轮只练上一轮未掌握题。旧作答和成绩保留在历史记录。</p><div class="fields"><label>孩子<input id="child" value="${esc(C.defaultName)}"></label><label>学期<input id="term" value="2026秋"></label><label>阶段<select id="stage"><option>期末</option><option>期中</option><option>日常</option></select></label></div><button id="new" class="primary">开始全卷新复习 · 空白第1轮</button><button id="history">查看历史批改记录（${olds.length} 份原有本机轮次）</button><button id="export">导出全部本机记录备份</button></section><section><h2>已有独立复习批次</h2>${bs.length?bs.map(b=>`<article class="batch"><b>${esc(b.child)} · ${esc(b.semester)} · ${esc(b.stage)}</b><p>${esc(new Date(b.createdAt).toLocaleString('zh-CN'))} · 批次 ${esc(b.id.slice(0,8))}</p><button data-open="${b.id}">继续本批次</button><button data-bhistory="${b.id}">查看本批次历史成绩</button></article>`).join(''):'<p>尚无新批次。原有记录请在历史中查看。</p>'}</section>${cloudPanel()}`;
 const masteryButton=document.createElement('button');masteryButton.id='mastery';masteryButton.textContent='错题分级与再练 · 全部未掌握＋抽测';$('history').before(masteryButton);masteryButton.onclick=()=>{const meta=metadata();if(meta){masteryMeta=meta;view='mastery';renderMastery();if(unlocked)cloudAction(async()=>{await loadMasteryCloud();renderMastery();message('已合并本机与云端有效记录。');});}};
 $('new').onclick=()=>{const meta=metadata();if(meta)createBatch(meta);};$('history').onclick=()=>showHistory();$('export').onclick=exportAll;
 app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openBatch(b.dataset.open));
 app.querySelectorAll('[data-bhistory]').forEach(b=>b.onclick=()=>{batch=read(PREFIX+b.dataset.bhistory);showHistory(batch.id);});bindCloud();
}
function header(){return `<div class="toolbar"><button id="home">返回复习入口</button><button id="hist">查看历史批改记录</button><button id="export">导出全部本机记录备份</button></div>`;}
function render(){if(view==='mastery'){renderMastery();return;}if(view==='home'){home();return;}if(view==='history'){renderHistory();return;}
 const d=roundData(),qs=required(),count=qs.filter(q=>ready(q,d)).length,show=revealed.has(mode+'|'+r);
 app.innerHTML=header()+`<section><h2>${esc(batch.child)} · ${esc(batch.semester)} · ${esc(batch.stage)}</h2><p>批次 ${esc(batch.id.slice(0,8))} · ${new Date(batch.createdAt).toLocaleString('zh-CN')}</p><div class="toolbar">${['memory','scene'].map(m=>`<button data-mode="${m}" class="${m===mode?'selected':''}">${label[m]}</button>`).join('')}</div><div class="toolbar">${[1,2,3].map(n=>`<button data-round="${n}" class="${n===r?'selected':''}" ${!batch.rounds[mode][n]?'disabled':''}>第${n}轮</button>`).join('')}</div><h3>${label[mode]} · 第${r}轮 · ${qs.length}题</h3><p id="progress">${d.done?'本轮已完成，历史作答与答案默认收起。可查看历史，或进入空白下一轮。':d.graded?'已批改。请对照参考答案，勾选独立答对的题；不会的保持不勾。':`已完成 ${count}/${qs.length} 题；全部作答或选择“暂时不会”后才可批改。`}</p>${d.graded&&!show?'<button id="reveal">查看本轮历史作答与批改</button>':''}</section><div id="questions">${qs.map(q=>card(q,d,show)).join('')||'<section>本轮没有待巩固题，可以直接完成本轮。</section>'}</div><section class="actions"><button id="grade" class="primary" ${d.graded||count<qs.length?'disabled':''}>完成作答，批改并显示答案</button><button id="finish" ${d.done||(!d.graded&&qs.length>0)?'disabled':''}>${d.done?'✓ 本轮已核对完成':'本轮核对完毕并保存成绩'}</button><button id="next" ${!d.done||r===3?'disabled':''}>${r===3?'三轮结束':'进入第'+(r+1)+'轮 · 只练未掌握题'}</button>${d.done?'<button id="retry">以本轮未掌握题开始新批次（空白）</button>':''}</section>${cloudPanel()}`;
 $('home').onclick=()=>{batch=null;view='home';history=null;revealed.clear();render();};$('hist').onclick=()=>showHistory();$('export').onclick=exportAll;
 app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;r=1;revealed.clear();render();});
 app.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>{r=+b.dataset.round;revealed.clear();render();});
 app.querySelectorAll('[data-answer]').forEach(el=>el.oninput=()=>{if(d.graded||d.done)return;const id=el.dataset.answer;(d.answers[id]||={})[el.dataset.field]=el.value;persist();$('grade').disabled=!qs.every(q=>ready(q,d));$('progress').textContent=`已完成 ${qs.filter(q=>ready(q,d)).length}/${qs.length} 题；全部完成后可批改。`;});
 app.querySelectorAll('[data-skip]').forEach(el=>el.onchange=()=>{if(d.graded||d.done)return;d.skipped[el.dataset.skip]=el.checked;persist();render();});
 app.querySelectorAll('[data-tick]').forEach(el=>el.onchange=()=>{if(!d.graded||d.done)return;d.ticks[el.dataset.tick]=el.checked;persist();});
 $('grade').onclick=()=>{if(d.graded||!qs.every(q=>ready(q,d)))return;d.graded=true;if(!persist())return;revealed.add(mode+'|'+r);render();};
 if($('reveal'))$('reveal').onclick=()=>{revealed.add(mode+'|'+r);render();};
 $('finish').onclick=()=>{if(d.done||(!d.graded&&qs.length))return;d.done=true;d.completedAt=new Date().toISOString();d.attemptId=uuid();if(!persist())return;render();if(unlocked)syncAll();};
 $('next').onclick=()=>{if(!d.done||r>=3)return;const next=r+1;if(!roundData(mode,next)){batch.rounds[mode][next]={ids:d.ids.filter(id=>!d.ticks[id]),answers:{},skipped:{},ticks:{},graded:false,done:false};if(!persist())return;}r=next;revealed.clear();render();};
 if($('retry'))$('retry').onclick=()=>retry(qs.filter(q=>!d.ticks[q.id]).map(q=>q.id));bindCloud();
}
function card(q,d,show){const skipped=!!d.skipped[q.id],locked=d.graded||d.done;
 const answers=q.fields.map((f,i)=>`<label class="answer-label">${q.fields.length>1?'第'+(i+1)+'空':'我的回答'}<textarea rows="${q.mode==='scene'?3:1}" data-answer="${esc(q.id)}" data-field="${esc(f)}" autocomplete="off" ${locked||skipped?'disabled':''}>${esc(locked&&!show?'':(d.answers[q.id]?.[f]||''))}</textarea></label>`).join('');
 return `<article class="question" data-q="${esc(q.id)}"><h3>${esc(q.title)}</h3><div class="prompt">${q.prompt}</div>${answers}<label><input type="checkbox" data-skip="${esc(q.id)}" ${skipped?'checked':''} ${locked?'disabled':''}> 暂时不会（不必猜答案）</label>${d.graded&&show?`<div class="answer"><strong>参考答案：</strong>${esc(q.answer)}</div><label class="mastery"><input type="checkbox" data-tick="${esc(q.id)}" ${d.ticks[q.id]?'checked':''} ${d.done||skipped?'disabled':''}> 我对照答案确认：这题独立答对了</label>`:''}</article>`;
}
function retry(ids){if(!ids.length){alert('没有待巩固题。可回入口开始全卷新复习。');return;}const meta={child:history?.child||batch?.child||C.defaultName,semester:history?.semester||batch?.semester||'2026秋',stage:'日常'};if(!/^20\d\d/.test(meta.semester))meta.semester='2026秋';createBatch(meta,ids);}
function batchRecords(b){const out=[];for(const m of ['memory','scene'])for(const n of [1,2,3]){const d=b.rounds[m][n];if(!d)continue;out.push({id:b.id+'|'+m+'|'+n,title:`${b.child} · ${b.semester} · ${b.stage} · 批次 ${b.id.slice(0,8)} · ${label[m]} · 第${n}轮`,child:b.child,semester:b.semester,stage:b.stage,mode:m,round:n,done:d.done,items:questions(m).filter(q=>d.ids.includes(q.id)).map(q=>({id:q.id,title:q.title,fields:d.answers[q.id]||{},correct:!!d.ticks[q.id],skipped:!!d.skipped[q.id],expected:d.graded?q.answer:''}))});}return out;}
function showHistory(batchId){view='history';history=null;renderHistory(batchId);}
function renderHistory(batchId){
 const records=batchId?batchRecords(read(PREFIX+batchId)):[...legacyRecords(),...batches().flatMap(batchRecords)];
 app.innerHTML=header()+`<section><h2>历史批改记录 · 只读</h2><p>这里保留旧作答用于核对。点击“空白复练”只传入未掌握题号，旧错误作答、正确答案和勾选都不会带入。</p><div class="history-list">${records.map((x,i)=>`<p><button data-record="${i}">${esc(x.title)}</button> ${x.done?'已完成 · '+x.items.filter(i=>i.correct).length+'/'+x.items.length+'掌握':'草稿／尚未完成'}</p>`).join('')||'<p>本机暂无历史记录。</p>'}</div></section><div id="history-detail"></div>${cloudPanel(true)}`;
 $('home').onclick=()=>{view='home';history=null;render();};$('hist').onclick=()=>showHistory();$('export').onclick=exportAll;
 app.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>showRecord(records[+b.dataset.record]));bindCloud();
}
function showRecord(record){history=record;const wrong=record.items.filter(x=>!x.correct&&bank.some(q=>q.id===x.id));
 $('history-detail').innerHTML=`<section><h2>${esc(record.title)}</h2><p>${record.done?'已完成记录':'草稿，仅供查看'} · ${record.items.filter(x=>x.correct).length}/${record.items.length} 掌握</p><button id="retry-history" ${!record.done||!wrong.length?'disabled':''}>只带入 ${wrong.length} 道未掌握题号 · 空白复练</button></section>`+record.items.map(x=>`<article class="question"><h3>${esc(x.title||x.id)}</h3><p class="old">历史作答（${x.correct?'当时勾选掌握':record.done?'当时未确认掌握':'尚未有效核对'}）：${esc(Object.values(x.fields||{}).join('；')||'未作答')}</p><p>参考答案：${esc(x.expected||'未保存')}</p></article>`).join('');
 $('retry-history').onclick=()=>retry(wrong.map(x=>x.id));$('history-detail').scrollIntoView({block:'start'});
}
function exportAll(){const data={exportedAt:new Date().toISOString(),quizId:C.quizId,records:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX)||k===C.localKey||(C.air&&k.startsWith(C.localKey)))data.records[k]=localStorage.getItem(k);}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=C.quizId+'-全部历史备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function cloudPanel(hist=false){return `<section class="cloud"><h2>家庭云端档案</h2><p>沿用原家庭档案。新成绩按批次另存；历史只读查看，旧答案不会恢复到新练习输入框。</p><label>家庭暗号 <input id="pass" type="password" autocomplete="off"></label><button id="unlock">解锁家庭档案</button><button id="sync">同步新批次已完成轮次</button><button id="cloud-history">查看云端历史成绩</button><p id="cloud-status" role="status">${unlocked?'已解锁家庭档案':'可先在本机练习；解锁后同步和查看云端记录。'}</p>${hist?'<label>云端姓名<input id="cloud-child" value="'+esc(C.defaultName)+'"></label><label>云端学期<input id="cloud-term" value="2026秋"></label>':''}<div id="cloud-records"></div></section>`;}
function decodeAnswer(raw){try{const v=JSON.parse(raw||'{}');return v&&typeof v==='object'?v:{answer:String(v??'')};}catch(e){return {answer:raw||''};}}
function message(s){if($('cloud-status'))$('cloud-status').textContent=s;}
async function identity(){if(!client){if(!window.supabase)throw Error('云端组件尚未加载，请稍后再试');client=window.supabase.createClient('https://iqlnwzxmtjjgzisufljd.supabase.co','sb_publishable_jnY3xbWPgPFBd6naW35bXQ_tzZcNOTE');}let s=await client.auth.getSession();if(s.error)throw s.error;if(!s.data.session){s=await client.auth.signInAnonymously();if(s.error)throw s.error;}const u=await client.auth.getUser();if(u.error)throw u.error;user=u.data.user;const a=await client.from('family_access').select('user_id').eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;unlocked=!!a.data;}
function bindCloud(){for(const id of ['unlock','sync','cloud-history'])$(id).disabled=busy;
 $('unlock').onclick=()=>cloudAction(async()=>{await identity();if(!unlocked){const pass=$('pass').value.trim();if(!pass)throw Error('请输入家庭暗号');const a=await client.functions.invoke('unlock-family',{body:{passphrase:pass}});if(a.error)throw a.error;if(!a.data?.ok)throw Error(a.data?.error||'解锁失败');await identity();}if(!unlocked)throw Error('家庭档案未解锁');$('pass').value='';if(view==='mastery'){await loadMasteryCloud();renderMastery();}message('家庭档案已解锁，可以同步和查看历史。');});
 $('sync').onclick=()=>syncAll();$('cloud-history').onclick=()=>cloudAction(loadCloudHistory);
}
async function cloudAction(fn){if(busy)return;busy=true;for(const id of ['unlock','sync','cloud-history'])if($(id))$(id).disabled=true;try{await fn();}catch(e){message('云端操作未完成，本机记录仍保留：'+e.message);}finally{busy=false;for(const id of ['unlock','sync','cloud-history'])if($(id))$(id).disabled=false;}}
async function syncAll(){return cloudAction(async()=>{await identity();if(!unlocked)throw Error('请先解锁家庭档案');let count=0;
 for(const b of batches())for(const m of ['memory','scene'])for(const n of [1,2,3]){const d=b.rounds[m][n];if(!d?.done||d.synced)continue;const qs=questions(m).filter(q=>d.ids.includes(q.id));if(!qs.length)continue;
 const correct=qs.filter(q=>d.ticks[q.id]).length;const attempt={id:d.attemptId,created_by:user.id,child_name:b.child,quiz_id:C.quizId,semester:b.semester,phase:b.stage+'-'+label[m],round_no:n,total_questions:qs.length,correct_questions:correct,score:Math.round(correct/qs.length*10000)/100,completed_at:d.completedAt};
 const existing=await client.from('quiz_attempts_secure').select('id').eq('id',attempt.id).maybeSingle();if(existing.error)throw existing.error;if(!existing.data){const a=await client.from('quiz_attempts_secure').insert(attempt);if(a.error)throw a.error;}
 const old=await client.from('quiz_item_results_secure').select('correct_char').eq('attempt_id',attempt.id);if(old.error)throw old.error;const present=new Set((old.data||[]).map(x=>x.correct_char));
 const rows=qs.filter(q=>!present.has(q.id)).map(q=>({attempt_id:attempt.id,created_by:user.id,child_name:b.child,semester:b.semester,correct_char:q.id,expected_word:q.answer,question_type:label[m],given_answer:JSON.stringify({title:q.title,fields:d.answers[q.id]||{},skipped:!!d.skipped[q.id],review:{version:2,batchId:b.id,child:b.child,semester:b.semester,stage:b.stage,mode:m,round:n,independent:true,completedAt:d.completedAt,reviewPlan:b.reviewPlan||null}}),is_correct:!!d.ticks[q.id]}));
 if(rows.length){const a=await client.from('quiz_item_results_secure').insert(rows);if(a.error)throw a.error;}
 // Re-read before marking synced so a concurrently edited draft is never replaced.
 const latest=read(PREFIX+b.id);latest.rounds[m][n].synced=true;if(!persist(latest))throw Error('同步标记保存失败');if(batch?.id===b.id&&batch.rounds[m][n])batch.rounds[m][n].synced=true;count++;
 }message('同步完成：新增保存 '+count+' 轮；原有云端记录保留。');});}
async function loadCloudHistory(){await identity();if(!unlocked)throw Error('请先解锁家庭档案');const name=$('cloud-child')?.value.trim()||batch?.child||C.defaultName,term=$('cloud-term')?.value.trim()||batch?.semester||'2026秋';cloudAttempts=[];
 for(let offset=0;;offset+=200){const a=await client.from('quiz_attempts_secure').select('id,child_name,semester,phase,round_no,completed_at,total_questions,correct_questions,score').eq('quiz_id',C.quizId).eq('child_name',name).eq('semester',term).order('completed_at',{ascending:false}).range(offset,offset+199);if(a.error)throw a.error;cloudAttempts.push(...a.data);if(a.data.length<200)break;}
 $('cloud-records').innerHTML='<h3>云端历史成绩 · 只读</h3>'+cloudAttempts.map((a,i)=>`<p><button data-cloud="${i}">${esc(a.phase)} · 第${a.round_no}轮 · ${a.correct_questions}/${a.total_questions} · ${esc(new Date(a.completed_at).toLocaleString('zh-CN'))}</button></p>`).join('');
 app.querySelectorAll('[data-cloud]').forEach(b=>b.onclick=()=>cloudAction(()=>showCloudRecord(cloudAttempts[+b.dataset.cloud])));message('已读取 '+cloudAttempts.length+' 份云端历史成绩。');}
async function showCloudRecord(a){let rows=[];for(let offset=0;;offset+=200){const b=await client.from('quiz_item_results_secure').select('correct_char,expected_word,given_answer,is_correct').eq('attempt_id',a.id).order('correct_char').range(offset,offset+199);if(b.error)throw b.error;rows.push(...b.data);if(b.data.length<200)break;}
 const record={id:a.id,title:a.child_name+' · '+a.semester+' · '+a.phase+' · 第'+a.round_no+'轮 · '+a.completed_at,child:a.child_name,semester:a.semester,stage:a.phase,done:true,items:rows.map(x=>{const v=decodeAnswer(x.given_answer);let id=x.correct_char;if(!C.air&&C.grade===4)id=id.replace(/^m-/, 'memory-').replace(/^s-/, 'scene-');return {id,title:v.title||v.question||id,fields:v.fields||{answer:v.answer||''},correct:!!x.is_correct,expected:bank.find(q=>q.id===id)?.answer||x.expected_word};})};
 if(!$('history-detail')){view='history';renderHistory();}showRecord(record);message('已打开云端历史批改；新练习未带入任何旧答案。');}

function localMasteryEvents(meta){
 const events=[];
 for(const record of legacyRecords()){
  if(record.child!==meta.child||!record.done)continue;
  const term=record.semester==='原记录未标明'?'2026秋':record.semester;
  if(term!==meta.semester)continue;
  for(const item of record.items)events.push({key:record.id+'|'+item.id,questionId:item.id,valid:item.correct||item.skipped||Object.values(item.fields).some(v=>String(v).trim()),correct:item.correct,answered:Object.values(item.fields).some(v=>String(v).trim()),skipped:item.skipped,at:record.at,independent:false});
 }
 for(const b of batches()){
  if(b.child!==meta.child||b.semester!==meta.semester)continue;
  for(const m of ['memory','scene'])for(const n of [1,2,3]){const d=b.rounds[m][n];if(!d?.done)continue;
   for(const id of d.ids)events.push({key:d.attemptId+'|'+id,questionId:id,valid:true,correct:!!d.ticks[id],answered:Object.values(d.answers[id]||{}).some(v=>String(v).trim()),skipped:!!d.skipped[id],at:d.completedAt,independent:true,batchId:b.id});
  }
 }return events;
}
function masteryRows(){const scope=masteryMeta.child+'|'+masteryMeta.semester;return window.ScienceMastery.classify(bank,[...localMasteryEvents(masteryMeta),...(masteryCloudScope===scope?masteryCloudEvents:[])]);}
function renderMastery(){
 const rows=masteryRows(),plan=window.ScienceMastery.plan(rows),counts={};for(const q of rows)counts[q.level]=(counts[q.level]||0)+1;
 const loaded=masteryCloudLoaded&&masteryCloudScope===masteryMeta.child+'|'+masteryMeta.semester;
 app.innerHTML=header()+`<section><h2>错题分级 · ${esc(masteryMeta.child)} · ${esc(masteryMeta.semester)}</h2><p>历史曾错 <b>${rows.filter(q=>q.hadWrong).length}</b> 题；当前仍未掌握 <b>${counts.unresolved||0}</b> 题。只使用已完成核对的有效记录，未做不算做错。</p><p>${loaded?'已合并原有云端和本机记录。':'当前仅分析本机记录；解锁后点击下方“合并云端记录并重新分级”，可纳入其他设备历史。'}无学期的旧版本机记录按原2026秋分析，保留原数据。</p><button id="mastery-cloud">合并云端记录并重新分级</button><p>稳定掌握：不同独立批次至少两次无提示答对，间隔不少于24小时。旧记录无法证明独立作答时，只作为待验证证据。</p></section><section><h2>本次错题再练</h2><p>必练 ${plan.required.length} 题＋已纠正抽测 ${plan.sampled.length} 题＝${plan.ids.length} 题。默认最多抽测5道，优先较久未验证的易错题；这不是全卷题数。</p><label>新批次阶段<select id="retry-stage"><option ${masteryMeta.stage==='日常'?'selected':''}>日常</option><option ${masteryMeta.stage==='期中'?'selected':''}>期中</option><option ${masteryMeta.stage==='期末'?'selected':''}>期末</option></select></label><button id="mastery-retry" class="primary" ${!plan.ids.length?'disabled':''}>开始错题再练 · 空白作答</button><button id="final-full">开始期末全卷 · 全新三轮</button><p>期末全卷包含所有题目；批次中的第二、三轮只根据本批次上一轮未掌握题筛选。</p></section>`+
 ['unresolved','unstable','stable','unseen'].map(level=>`<section><h2>${({unresolved:'① 仍未掌握 · 必须再练',unstable:'② 已纠正／暂时掌握 · 待独立验证',stable:'③ 稳定掌握 · 正常复习',unseen:'尚未有效核对 · 不计作错题'})[level]}（${counts[level]||0}）</h2>${rows.filter(q=>q.level===level).map(q=>`<p data-mastery-id="${esc(q.id)}" data-level="${level}"><strong>${esc(label[q.mode])} · ${esc(q.title)}</strong> · ${esc(q.reason)}${q.hadWrong?' · 历史曾错':''}</p>`).join('')||'<p>暂无</p>'}</section>`).join('')+cloudPanel();
 $('home').onclick=()=>{view='home';render();};$('hist').onclick=()=>showHistory();$('export').onclick=exportAll;
 $('mastery-retry').onclick=()=>{const meta={...masteryMeta,stage:$('retry-stage').value};createBatch(meta,plan.ids,{kind:'current-unresolved-plus-sample',required:plan.required,sampled:plan.sampled,asOf:new Date().toISOString(),stableRule:'two-independent-batches-at-least-24-hours',sources:masteryCloudLoaded?'local-and-cloud':'local'});};
 $('final-full').onclick=()=>createBatch({...masteryMeta,stage:'期末'});
 $('mastery-cloud').onclick=()=>cloudAction(async()=>{await loadMasteryCloud();renderMastery();message('已合并云端历史，分级只使用有效核对记录；不会带入旧答案。');});bindCloud();
}
async function loadMasteryCloud(){
 await identity();if(!unlocked)throw Error('请先解锁家庭档案');const meta={...masteryMeta};let attempts=[];
 for(let offset=0;;offset+=200){const a=await client.from('quiz_attempts_secure').select('id,phase,round_no,completed_at').eq('quiz_id',C.quizId).eq('child_name',meta.child).eq('semester',meta.semester).order('completed_at',{ascending:true}).range(offset,offset+199);if(a.error)throw a.error;attempts.push(...a.data);if(a.data.length<200)break;}
 const events=[];
 for(let pos=0;pos<attempts.length;pos+=20){const group=attempts.slice(pos,pos+20),byId=new Map(group.map(a=>[a.id,a]));
 for(let offset=0;;offset+=200){const a=await client.from('quiz_item_results_secure').select('id,attempt_id,correct_char,given_answer,is_correct').in('attempt_id',group.map(a=>a.id)).order('id').range(offset,offset+199);if(a.error)throw a.error;
  for(const item of a.data){const v=decodeAnswer(item.given_answer);let id=item.correct_char;if(!C.air&&C.grade===4)id=id.replace(/^m-/,'memory-').replace(/^s-/,'scene-');const attempt=byId.get(item.attempt_id);const fields=v.fields||{answer:v.answer||''};events.push({key:attempt.id+'|'+id,questionId:id,valid:!!item.is_correct||!!v.skipped||Object.values(fields).some(x=>String(x).trim()),correct:!!item.is_correct,answered:Object.values(fields).some(x=>String(x).trim()),skipped:!!v.skipped,at:attempt.completed_at,independent:v.review?.version===2&&v.review?.independent!==false,batchId:v.review?.batchId});}
  if(a.data.length<200)break;
 }}
 masteryCloudScope=meta.child+'|'+meta.semester;masteryCloudEvents=events;masteryCloudLoaded=true;
}

async function loadBank(){
 if(C.air){const res=await fetch('air-unit-data.js');if(!res.ok)throw Error('空气题库加载失败');const raw=await res.text();const rows=JSON.parse(raw.match(/window.AIR_UNIT_QUESTIONS=(\[.*\]);/)[1]);return rows.map(q=>({id:q.id,mode:q.mode,title:q.id+' · 第'+q.lesson+'课',prompt:esc(q.q),fields:['answer'],answer:q.a+' '+q.why}));}
 const res=await fetch(C.source);if(!res.ok)throw Error('原题加载失败');const doc=new DOMParser().parseFromString(await res.text(),'text/html');const sources=[...doc.querySelectorAll('#key-list details')];
 return [...doc.querySelectorAll(C.grade===4?'.q-card':'.card[data-mode]')].map(card=>{
 const mode=C.grade===4?(card.dataset.part==='m'?'memory':'scene'):card.dataset.mode,number=Number(card.dataset.q||card.dataset.n);
 const title=(card.querySelector('.card-head h3,.story-title,.card-header strong')?.textContent||'第'+number+'题').trim();
 const prompt=card.querySelector(C.grade===4?'.body-copy':'.question').cloneNode(true);
 prompt.querySelectorAll('input,textarea').forEach((e,i)=>{const span=doc.createElement('span');span.textContent='〔第'+(i+1)+'空〕';e.replaceWith(span);});
 const inputs=[...card.querySelectorAll(C.grade===4?'[data-id]':'.blank-field,.response')];
 const fields=inputs.map((f,i)=>C.grade===4?f.dataset.id:(f.matches('.response')?'essay':'blank'+i));
 const answer=C.grade===4?card.querySelector('.answer-content')?.textContent:sources[number-1]?.querySelectorAll('p')[mode==='memory'?0:1]?.textContent;
 if(C.quizId==='gaoyutong-grade6-science'&&mode==='memory'&&number===12&&!fields.length){prompt.textContent='饥饿说明体内什么不足？缺少糖类可能出现哪些表现？';fields.push('essay');}
 if(!answer||!fields.length)throw Error('题库不完整：'+mode+'-'+number);
 return {id:mode+'-'+number,mode,number,title,prompt:prompt.innerHTML,fields,legacyFields:inputs.map(f=>f.dataset.id),answer:answer.trim()};
 });
}
window.addEventListener('storage',e=>{if(batch&&e.key===PREFIX+batch.id){batch=read(e.key);revealed.clear();render();}});
(async()=>{try{bank=await loadBank();if(!bank.length)throw Error('题库为空');render();const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';s.onerror=()=>message('云端组件加载失败，本机练习仍可保存。');s.onload=async()=>{try{const c=window.supabase.createClient('https://iqlnwzxmtjjgzisufljd.supabase.co','sb_publishable_jnY3xbWPgPFBd6naW35bXQ_tzZcNOTE');const session=await c.auth.getSession();if(session.data?.session){client=c;await identity();if(unlocked)message('已连接原家庭档案；完成新轮次后自动同步。');}}catch(e){message('云端暂不可用，本机作答仍可保存。');}};document.head.appendChild(s);}catch(e){app.textContent='加载失败：'+e.message+'。请刷新或联系家长，原有记录保留。';}})();
})();
