/* Independent review v2. Legacy keys are read-only; completed rounds are immutable. */
(()=>{
'use strict';
const C=JSON.parse(document.getElementById('review-config').textContent);
const aliases={'pass':['cloudPassphrase','passphrase'],'unlock':['cloudUnlock'],'sync':['cloudSync'],'cloud-history':['cloudRestore','restore'],'cloud-status':['cloudStatus'],'cloud-records':['cloudReport']};
const $=id=>document.getElementById(id)||(aliases[id]||[]).map(x=>document.getElementById(x)).find(Boolean), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IMPORT_PREFIX='science-review-import|'+encodeURIComponent(C.quizId)+'|';
const PREFIX='science-review-v2|'+encodeURIComponent(C.quizId)+'|';
const uuid=()=>crypto.randomUUID();
const label={memory:'基础填空',scene:'情境挑战'};
let bank=[],batch=null,mode='memory',r=1,view='home',history=null,client=null,user=null,unlocked=false,busy=false;
let revealed=new Set(), cloudAttempts=[],cloudItems=new Map();
let masteryMeta=null,masteryCloudEvents=[],masteryCloudScope='',masteryCloudLoaded=false;
const app=$('app');
function read(key){const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}
function batches(){const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX)){const b=read(k);if(b?.version===2)out.push(b);}}return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
function persist(b=batch){try{const raw=JSON.stringify(b);localStorage.setItem(PREFIX+b.id,raw);if(b.id===batch?.id)localStorage.setItem('science-review-active|'+C.quizId,b.id);if(localStorage.getItem(PREFIX+b.id)!==raw)throw Error('保存验证失败');return true;}catch(e){alert('保存失败，请先导出备份，暂勿关闭页面：'+e.message);return false;}}
function questions(m=mode){return bank.filter(q=>q.mode===m);}
function roundData(m=mode,n=r,b=batch){return b.rounds[m][n];}
function createBatch(meta,ids=null,reviewPlan=null,store=true){
 const b={version:2,id:uuid(),quizId:C.quizId,child:meta.child,semester:meta.semester,stage:meta.stage,createdAt:new Date().toISOString(),questionIds:ids||bank.map(q=>q.id),reviewPlan,rounds:{memory:{},scene:{}}};
 for(const m of ['memory','scene']) b.rounds[m][1]={ids:questions(m).filter(q=>b.questionIds.includes(q.id)).map(q=>q.id),answers:{},skipped:{},ticks:{},graded:false,done:false};
 if(store&&!persist(b))return;
 batch=b;mode=b.rounds.memory[1].ids.length?'memory':'scene';r=1;view='practice';revealed.clear();history=null;if(store)localStorage.setItem('science-review-active|'+C.quizId,b.id);nativePanel=mode;nativeRounds={memory:1,scene:1};nativeFilter={memory:false,scene:false};render();
}
function openBatch(id){batch=read(PREFIX+id);mode=batch.rounds.memory[1].ids.length?'memory':'scene';r=1;view='practice';history=null;revealed.clear();nativePanel=mode;nativeRounds={memory:1,scene:1};nativeFilter={memory:false,scene:false};localStorage.setItem('science-review-active|'+C.quizId,id);render();}
function required(){const d=roundData();return questions().filter(q=>d.ids.includes(q.id));}
function ready(q,d){return !!d.skipped[q.id]||q.fields.every(f=>String(d.answers[q.id]?.[f]||'').trim());}
function metadata(){const child=$('child').value.trim(),semester=$('term').value.trim(),stage=$('stage').value;if(!child||!semester){alert('请填写孩子姓名和学期。');return null;}return {child,semester,stage};}
function legacyRecords(){
 const records=[];
 const keys=[...(C.air?Object.keys(localStorage).filter(k=>k.startsWith(C.localKey)):[C.localKey]),...Object.keys(localStorage).filter(k=>k.startsWith(IMPORT_PREFIX))];
 for(const key of keys){const saved=read(key),isImport=key.startsWith(IMPORT_PREFIX),s=isImport?saved?.state:saved;if(!s)continue;
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
  if(done||items.some(x=>x.correct||x.skipped||Object.values(x.fields).some(Boolean)))records.push({id:'legacy|'+key+'|'+m+'|'+n,title:'原有本机记录 · '+label[m]+' · 第'+n+'轮',child:s.name||C.defaultName,semester:isImport?saved.semester:C.air?key.slice(C.localKey.length):'原记录未标明',stage:'原有记录',mode:m,round:n,at:C.air?d.finishedAt:null,done,items});
 }}return records;
}
function home(){
 showTools();
 const bs=batches();const olds=legacyRecords();
 app.innerHTML=`<section><h2>开始新一次独立复习</h2><p>新批次有全新三轮。第一轮练全部题目，第二、三轮只练上一轮未掌握题。旧作答和成绩保留在历史记录。</p><div class="fields"><label>孩子<input id="child" value="${esc(C.defaultName)}"></label><label>学期<input id="term" value="2026秋"></label><label>阶段<select id="stage"><option>期末</option><option>期中</option><option>日常</option></select></label></div><button id="new" class="primary">开始全卷新复习 · 空白第1轮</button><button id="history">查看历史批改记录（${olds.length} 份原有本机轮次）</button><button id="export">导出全部本机记录备份</button></section><section><h2>已有独立复习批次</h2>${bs.length?bs.map(b=>`<article class="batch"><b>${esc(b.child)} · ${esc(b.semester)} · ${esc(b.stage)}</b><p>${esc(new Date(b.createdAt).toLocaleString('zh-CN'))} · 批次 ${esc(b.id.slice(0,8))}</p><button data-open="${b.id}">继续本批次</button><button data-bhistory="${b.id}">查看本批次历史成绩</button></article>`).join(''):'<p>尚无新批次。原有记录请在历史中查看。</p>'}</section>${cloudPanel()}`;
 const masteryButton=document.createElement('button');masteryButton.id='mastery';masteryButton.textContent='错题分级与再练 · 全部未掌握＋抽测';$('history').before(masteryButton);masteryButton.onclick=()=>{const meta=metadata();if(meta){masteryMeta=meta;view='mastery';renderMastery();if(unlocked)cloudAction(async()=>{await loadMasteryCloud();renderMastery();message('已合并本机与云端有效记录。');});}};
 $('new').onclick=()=>{const meta=metadata();if(meta)createBatch(meta);};$('history').onclick=()=>showHistory();$('export').onclick=exportAll;
 if(originalRoot&&batch){const back=document.createElement('button');back.id='back-sheet';back.textContent='返回原试卷';app.prepend(back);back.onclick=nativeBack;}
 app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openBatch(b.dataset.open));
 app.querySelectorAll('[data-bhistory]').forEach(b=>b.onclick=()=>{batch=read(PREFIX+b.dataset.bhistory);showHistory(batch.id);});bindCloud();
}
function header(){return `<div class="toolbar"><button id="home">返回复习入口</button><button id="hist">查看历史批改记录</button><button id="export">导出全部本机记录备份</button></div>`;}
function render(){if(originalRoot&&view==='practice'){renderNative();return;}if(view==='mastery'){renderMastery();return;}if(view==='home'){home();return;}if(view==='history'){renderHistory();return;}
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
 showTools();
 const records=batchId?batchRecords(read(PREFIX+batchId)):[...legacyRecords(),...batches().flatMap(batchRecords)];
 app.innerHTML=header()+`<section><h2>历史批改记录 · 只读</h2><p>这里保留旧作答用于核对。点击“空白复练”只传入未掌握题号，旧错误作答、正确答案和勾选都不会带入。</p><div class="history-list">${records.map((x,i)=>`<p><button data-record="${i}">${esc(x.title)}</button> ${x.done?'已完成 · '+x.items.filter(i=>i.correct).length+'/'+x.items.length+'掌握':'草稿／尚未完成'}</p>`).join('')||'<p>本机暂无历史记录。</p>'}</div></section><div id="history-detail"></div>${cloudPanel(true)}`;
 $('home').onclick=()=>{history=null;nativeBack();};$('hist').onclick=()=>showHistory();$('export').onclick=exportAll;
 app.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>showRecord(records[+b.dataset.record]));bindCloud();
}
function showRecord(record){history=record;const wrong=record.items.filter(x=>!x.correct&&bank.some(q=>q.id===x.id));
 $('history-detail').innerHTML=`<section><h2>${esc(record.title)}</h2><p>${record.done?'已完成记录':'草稿，仅供查看'} · ${record.items.filter(x=>x.correct).length}/${record.items.length} 掌握</p><button id="retry-history" ${!record.done||!wrong.length?'disabled':''}>只带入 ${wrong.length} 道未掌握题号 · 空白复练</button></section>`+record.items.map(x=>`<article class="question"><h3>${esc(x.title||x.id)}</h3><p class="old">历史作答（${x.correct?'当时勾选掌握':record.done?'当时未确认掌握':'尚未有效核对'}）：${esc(Object.values(x.fields||{}).join('；')||'未作答')}</p><p>参考答案：${esc(x.expected||'未保存')}</p></article>`).join('');
 $('retry-history').onclick=()=>retry(wrong.map(x=>x.id));$('history-detail').scrollIntoView({block:'start'});
}
function exportAll(){const data={exportedAt:new Date().toISOString(),quizId:C.quizId,records:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX)||k.startsWith(IMPORT_PREFIX)||k===C.localKey||(C.air&&k.startsWith(C.localKey)))data.records[k]=localStorage.getItem(k);}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=C.quizId+'-全部历史备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
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
 for(const b of batches().filter(b=>!b.imported))for(const m of ['memory','scene'])for(const n of [1,2,3]){const d=b.rounds[m][n];if(!d?.done||d.synced)continue;const qs=questions(m).filter(q=>d.ids.includes(q.id));if(!qs.length)continue;
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
 $('cloud-records').hidden=false;$('cloud-records').innerHTML='<h3>云端历史成绩 · 只读</h3>'+cloudAttempts.map((a,i)=>`<p><button data-cloud="${i}">${esc(a.phase)} · 第${a.round_no}轮 · ${a.correct_questions}/${a.total_questions} · ${esc(new Date(a.completed_at).toLocaleString('zh-CN'))}</button></p>`).join('');
 document.querySelectorAll('[data-cloud]').forEach(b=>b.onclick=()=>cloudAction(()=>showCloudRecord(cloudAttempts[+b.dataset.cloud])));message('已读取 '+cloudAttempts.length+' 份云端历史成绩。');}
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
  if(b.imported||b.child!==meta.child||b.semester!==meta.semester)continue;
  for(const m of ['memory','scene'])for(const n of [1,2,3]){const d=b.rounds[m][n];if(!d?.done)continue;
   for(const id of d.ids)events.push({key:d.attemptId+'|'+id,questionId:id,valid:true,correct:!!d.ticks[id],answered:Object.values(d.answers[id]||{}).some(v=>String(v).trim()),skipped:!!d.skipped[id],at:d.completedAt,independent:true,batchId:b.id});
  }
 }return events;
}
function masteryRows(){const scope=masteryMeta.child+'|'+masteryMeta.semester;return window.ScienceMastery.classify(bank,[...localMasteryEvents(masteryMeta),...(masteryCloudScope===scope?masteryCloudEvents:[])]);}
function renderMastery(){
 showTools();
 const rows=masteryRows(),plan=window.ScienceMastery.plan(rows),counts={};for(const q of rows)counts[q.level]=(counts[q.level]||0)+1;
 const loaded=masteryCloudLoaded&&masteryCloudScope===masteryMeta.child+'|'+masteryMeta.semester;
 app.innerHTML=header()+`<section><h2>错题分级 · ${esc(masteryMeta.child)} · ${esc(masteryMeta.semester)}</h2><p>历史曾错 <b>${rows.filter(q=>q.hadWrong).length}</b> 题；当前仍未掌握 <b>${counts.unresolved||0}</b> 题。只使用已完成核对的有效记录，未做不算做错。</p><p>${loaded?'已合并原有云端和本机记录。':'当前仅分析本机记录；解锁后点击下方“合并云端记录并重新分级”，可纳入其他设备历史。'}无学期的旧版本机记录按原2026秋分析，保留原数据。</p><button id="mastery-cloud">合并云端记录并重新分级</button><p>稳定掌握：不同独立批次至少两次无提示答对，间隔不少于24小时。旧记录无法证明独立作答时，只作为待验证证据。</p></section><section><h2>本次错题再练</h2><p>必练 ${plan.required.length} 题＋已纠正抽测 ${plan.sampled.length} 题＝${plan.ids.length} 题。默认最多抽测5道，优先较久未验证的易错题；这不是全卷题数。</p><label>新批次阶段<select id="retry-stage"><option ${masteryMeta.stage==='日常'?'selected':''}>日常</option><option ${masteryMeta.stage==='期中'?'selected':''}>期中</option><option ${masteryMeta.stage==='期末'?'selected':''}>期末</option></select></label><button id="mastery-retry" class="primary" ${!plan.ids.length?'disabled':''}>开始错题再练 · 空白作答</button><button id="final-full">开始期末全卷 · 全新三轮</button><p>期末全卷包含所有题目；批次中的第二、三轮只根据本批次上一轮未掌握题筛选。</p></section>`+
 ['unresolved','unstable','stable','unseen'].map(level=>`<section><h2>${({unresolved:'① 仍未掌握 · 必须再练',unstable:'② 已纠正／暂时掌握 · 待独立验证',stable:'③ 稳定掌握 · 正常复习',unseen:'尚未有效核对 · 不计作错题'})[level]}（${counts[level]||0}）</h2>${rows.filter(q=>q.level===level).map(q=>`<p data-mastery-id="${esc(q.id)}" data-level="${level}"><strong>${esc(label[q.mode])} · ${esc(q.title)}</strong> · ${esc(q.reason)}${q.hadWrong?' · 历史曾错':''}</p>`).join('')||'<p>暂无</p>'}</section>`).join('')+cloudPanel();
 $('home').onclick=nativeBack;$('hist').onclick=()=>showHistory();$('export').onclick=exportAll;
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

// Bind the isolated review model to the original worksheet DOM and CSS.
const originalRoot=document.getElementById('original-layout');
let nativePanel='memory',nativeRounds={memory:1,scene:1},nativeFilter={memory:false,scene:false};
function showTools(){if(!originalRoot)return;originalRoot.remove();app.hidden=false;}
function nativeMeta(){return {child:batch?.child||C.defaultName,semester:batch?.semester||'2026秋',stage:batch?.stage||'日常'};}
function nativeBack(){if(originalRoot&&batch){view='practice';render();}else{view='home';render();}}
function nativeSelectMode(m){nativeRounds[mode]=r;mode=m;r=nativeRounds[m]||1;nativePanel=m;revealed.clear();render();}
function nativeSelectRound(n){
 if(n>1&&!roundData(mode,n-1)?.done){alert('请先完成上一轮核对。');return;}
 if(!roundData(mode,n)){const prev=roundData(mode,n-1);batch.rounds[mode][n]={ids:prev.ids.filter(id=>!prev.ticks[id]),answers:{},skipped:{},ticks:{},graded:false,done:false};persist();}
 r=n;nativeRounds[mode]=n;nativeFilter[mode]=n>1;revealed.clear();render();
}
function nativeGrade(){const d=roundData();if(d.graded){revealed.add(mode+'|'+r);render();return;}if(!required().every(q=>ready(q,d)))return;d.graded=true;if(persist()){revealed.add(mode+'|'+r);render();}}
function nativeFinish(){const d=roundData();if(d.done||(!d.graded&&d.ids.length))return;d.done=true;d.completedAt=new Date().toISOString();d.attemptId=uuid();if(persist()){render();if(unlocked)syncAll();}}
function nativeInput(q,f,value){const d=roundData();if(d.graded||d.done)return;(d.answers[q.id]||={})[f]=value;persist();nativeActionBars();}
function nativeTick(q,n,on){const d=roundData(q.mode,n);if(!d||!d.graded||d.done||d.skipped[q.id]||n!==r)return;d.ticks[q.id]=on;persist();nativeActionBars();}
function nativeMastery(){masteryMeta=nativeMeta();view='mastery';renderMastery();if(unlocked)cloudAction(async()=>{await loadMasteryCloud();renderMastery();message('已合并本机与云端有效记录。');});}
function nativeTools(){
 let bar=document.getElementById('review-entry');if(!bar){bar=document.createElement('div');bar.id='review-entry';bar.className='no-print';const anchor=originalRoot.querySelector(C.air?'header':C.grade===4?'main nav':'header nav');anchor.insertAdjacentElement('afterend',bar);}
 bar.innerHTML='<button type="button" id="review-blank">空白复练</button><button type="button" id="review-mastery">错题分级与再练 · 全部未掌握＋抽测</button><button type="button" id="review-history">查看历史记录</button><small>'+esc(batch.child)+' · '+esc(batch.semester)+' · '+esc(batch.stage)+' · 批次 '+esc(batch.id.slice(0,8))+'</small>';
 document.getElementById('review-blank').onclick=()=>{view='home';home();};document.getElementById('review-mastery').onclick=nativeMastery;document.getElementById('review-history').onclick=()=>showHistory();
}
function nativeSummary(){
 for(const m of ['memory','scene']){
 const rows=questions(m).filter(q=>batch.questionIds.includes(q.id));const groups=[[],[],[],[]];
 for(const q of rows){let first=0;for(let n=1;n<=3;n++)if(roundData(m,n)?.done&&roundData(m,n).ticks[q.id]){first=n;break;}groups[first?first-1:3].push(q.number||q.id);}
 const stats=[1,2,3].map(n=>{const d=roundData(m,n);return '第'+n+'轮：'+(d?.done?d.ids.filter(id=>d.ticks[id]).length+'/'+d.ids.length+' 掌握':'尚未完成');}).join('　');
 let html='<div class="tracker box"><h3>'+label[m]+'</h3><div class="roundstats">'+stats+'</div><div class="summary-grid">'+groups.map((a,i)=>'<div class="metric"><b class="n">'+a.length+'</b><span class="lbl">'+['第1轮掌握','第2轮掌握','第3轮掌握','尚未确认掌握'][i]+'</span></div>').join('')+'</div><p class="micro small">未完成轮次不计作错题；第二轮已掌握而未安排第三轮的题目，仍保留掌握记录。</p></div>';
 if(C.grade===4&&!C.air){html='<div class="box"><h3>'+label[m]+'</h3><div class="summary-grid">'+[1,2,3].map(n=>{const d=roundData(m,n);return '<div class="metric"><b>'+(d?.done?d.ids.filter(id=>d.ticks[id]).length:0)+'/'+(d?.ids.length??rows.length)+'</b><span>第'+n+'轮掌握</span></div>';}).join('')+'</div><p class="small">未完成轮次不计作错题，前轮已掌握而后轮未安排的题目保留掌握记录。</p><div class="reviewlist">'+groups.map((a,i)=>'<div class="review-col '+(i===3?'warn':'')+'"><h4>'+['第一次就会','第二次才会','第三次才会','尚未确认掌握'][i]+'（'+a.length+'题）</h4><p>'+(a.length?a.map(n=>'第'+n+'题').join('、'):'无')+'</p></div>').join('')+'</div></div>';}
 const host=document.getElementById('stats-'+m);if(host)host.innerHTML=html;
 if(C.grade===4&&!C.air){const target=document.getElementById('reportContent');if(m==='memory')target.innerHTML='';target.insertAdjacentHTML('beforeend',html);}
 }
}
function nativeActionBars(){
 for(const m of (C.air?[mode]:['memory','scene'])){const n=m===mode?r:(nativeRounds[m]||1),d=roundData(m,n);if(!d)continue;const qs=questions(m).filter(q=>d.ids.includes(q.id)),complete=qs.filter(q=>ready(q,d)).length;const p=C.grade===4&&!C.air?(m==='memory'?'m':'s'):m;
 const grade=document.getElementById(C.air?'grade':'grade-'+p),finish=C.air?document.getElementById('finish'):C.grade===6?document.getElementById('finish-'+m):originalRoot.querySelector('[data-finish="'+p+'"][data-round="'+n+'"]');
 if(grade){grade.disabled=!d.graded&&complete<qs.length;grade.textContent=d.graded?'查看本轮历史作答与批改':'批改并显示'+(C.air?'参考':'')+'答案';grade.onclick=()=>{mode=m;r=n;nativeGrade();};}
 if(finish){finish.disabled=d.done||(!d.graded&&qs.length>0);finish.textContent=d.done?'✓ 本轮已核对完成':'本轮全部核对完毕';finish.onclick=()=>{mode=m;r=n;nativeFinish();};}
 const status=document.getElementById(C.air?'now-action':'grade-status-'+p);if(status)status.textContent=d.done?'本轮已完成，旧作答默认收起；可查看历史或进入空白下一轮。':d.graded?'已批改，请核对参考答案后勾选独立答对的题。':'已完成 '+complete+'/'+qs.length+' 题；全部填写或选择“暂时不会”后可批改。';
 if(C.air){document.getElementById('next').disabled=!d.done||r===3;document.getElementById('next').onclick=()=>nativeSelectRound(r+1);}
 if(C.grade===4&&!C.air){for(let x=1;x<=3;x++){const b=originalRoot.querySelector('[data-finish="'+p+'"][data-round="'+x+'"]');b.disabled=x!==n||!!roundData(m,x)?.done||(!d.graded&&qs.length>0);b.textContent='第'+x+'轮'+(roundData(m,x)?.done?'已核对':'完成');b.onclick=()=>{if(x===n){mode=m;r=n;nativeFinish();}};const st=document.getElementById('round-'+p+'-'+x),rd=roundData(m,x);if(st)st.textContent='第'+x+'轮 '+(rd?.done?rd.ids.filter(id=>rd.ticks[id]).length+'/'+rd.ids.length+' 已掌握':'尚未完成');}}
 if(!C.air){const doneLabel=document.getElementById('done-'+m);if(doneLabel)doneLabel.textContent=d.done?'✓ 第'+n+'轮已核对':'第'+n+'轮尚未核对';const filterButton=document.getElementById('filter-'+m);if(filterButton)filterButton.textContent='只看待巩固题：'+(nativeFilter[m]?'开':'关');const all=questions(m).filter(q=>batch.questionIds.includes(q.id));const ticks=[1,2,3].reduce((sum,x)=>sum+Object.values(roundData(m,x)?.ticks||{}).filter(Boolean).length,0);const counter=document.getElementById('tickCount-'+p);if(counter)counter.textContent=ticks+'/'+(all.length*3)+' 次打勾';const mastered=all.filter(q=>[1,2,3].some(x=>roundData(m,x)?.done&&roundData(m,x).ticks[q.id])).length;const progress=document.getElementById('progress-'+p);if(progress)progress.style.width=(all.length?mastered/all.length*100:0)+'%';const finished=document.getElementById('finished-'+p);if(finished)finished.textContent='已完成轮次：'+([1,2,3].filter(x=>roundData(m,x)?.done).join('、')||'暂无');}
 if(C.air){const all=questions(mode),mastered=all.filter(q=>[1,2,3].some(x=>roundData(mode,x)?.done&&roundData(mode,x).ticks[q.id])).length;document.getElementById('progress-copy').textContent='累计掌握 '+mastered+' / '+all.length+'题';document.getElementById('round-progress').style.width=(all.length?mastered/all.length*100:0)+'%';break;}
 }
}
function nativeStaticCards(){
 const cards=originalRoot.querySelectorAll(C.grade===4?'.q-card':'.card[data-mode]');
 for(const card of cards){const m=C.grade===4?(card.dataset.part==='m'?'memory':'scene'):card.dataset.mode,number=Number(card.dataset.q||card.dataset.n);const q=bank.find(q=>q.mode===m&&q.number===number);if(!q)continue;
 const n=m===mode?r:(nativeRounds[m]||1),d=roundData(m,n),inBatch=batch.questionIds.includes(q.id),eligible=d?.ids.includes(q.id),show=revealed.has(m+'|'+n),locked=d?.graded||d?.done;
 card.hidden=!inBatch||(!eligible&&(nativeFilter[m]||n>1));card.classList.remove('hide-filter');
 if(C.quizId==='gaoyutong-grade6-science'&&m==='memory'&&number===12&&!card.querySelector('.response')){const question=card.querySelector('.question');question.textContent='饥饿说明体内什么不足？缺少糖类可能出现哪些表现？';const input=document.createElement('textarea');input.className='response';input.setAttribute('aria-label','第12题回答');question.after(input);}
 const fields=[...card.querySelectorAll(C.grade===4?'[data-id]':'.blank-field,.response')];fields.forEach((field,i)=>{const f=q.fields[i];field.value=locked&&!show?'':(d?.answers[q.id]?.[f]||'');field.disabled=!eligible||!!locked||!!d?.skipped[q.id];field.oninput=()=>{mode=m;r=n;nativeInput(q,f,field.value);};});
 let answer=card.querySelector('.grade-answer');if(!answer){answer=document.createElement('div');answer.className='grade-answer';answer.hidden=true;const anchor=card.querySelector('.eval,.trials');if(C.grade===4)anchor.after(answer);else anchor.before(answer);}if(C.grade===4){answer.innerHTML='<strong>参考答案：</strong>';const source=card.querySelector('details.key');const content=source?.querySelector('.answer-content'),note=source?.querySelector('.answer-note');if(content)answer.appendChild(content.cloneNode(true));if(note)answer.appendChild(note.cloneNode(true));}else{const source=originalRoot.querySelectorAll('#key-list details')[number-1]?.querySelectorAll('p')[m==='memory'?0:1];answer.innerHTML='<strong>参考答案：</strong> '+(source?source.innerHTML:esc(q.answer));}answer.hidden=!eligible||!d?.graded||!show;
 card.querySelectorAll('input.trial,input[data-tick]').forEach(tick=>{const x=Number(tick.dataset.round||tick.dataset.tick.split('-').at(-1)),rd=roundData(m,x);tick.checked=!!rd?.ticks[q.id];tick.disabled=x!==n||!eligible||!d?.graded||!!d?.done||!!d?.skipped[q.id];tick.onchange=()=>{mode=m;r=n;nativeTick(q,x,tick.checked);};});
 let skip=card.querySelector('.review-skip');if(!skip){skip=document.createElement('label');skip.className='review-skip no-print';skip.innerHTML='<input type="checkbox">暂时不会';card.querySelector('.eval,.trials').appendChild(skip);}const box=skip.querySelector('input');box.checked=!!d?.skipped[q.id];box.disabled=!eligible||!!locked;box.onchange=()=>{if(locked)return;d.skipped[q.id]=box.checked;persist();render();};
 const badge=card.querySelector('.status,.review-badge');if(badge)badge.textContent=!eligible?'前轮已掌握 · 本轮免做':d?.done?(d.ticks[q.id]?'本轮已掌握':'本轮未掌握'):d?.graded?'已批改 · 请核对':'尚未核对';
 }
}
function nativeAirCards(){
 const d=roundData(),qs=questions(),wanted=required(),show=revealed.has(mode+'|'+r);const host=document.getElementById('question-groups');host.innerHTML='';
 const lessons=window.AIR_UNIT_LESSONS||['感受空气','空气能占据空间吗','空气占据的空间会改变吗','空气有质量吗','空气流动有力量','我们来做热气球','风的成因','自制打气筒'];
 for(let lesson=1;lesson<=8;lesson++){
 const list=qs.filter(q=>q.lesson===lesson&&batch.questionIds.includes(q.id)&&(d.ids.includes(q.id)||(!nativeFilter[mode]&&r===1)));if(!list.length)continue;
 const section=document.createElement('section');section.className='lesson';section.innerHTML='<div class="lesson-heading"><h3>第'+lesson+'课 · '+esc(lessons[lesson-1])+'</h3><span>'+list.length+'题</span></div><div class="lesson-items"></div>';host.appendChild(section);
 for(const q of list){const skipped=!!d.skipped[q.id],locked=d.graded||d.done;const card=document.createElement('article');card.className='question';card.dataset.questionId=q.id;const value=locked&&!show?'':(d.answers[q.id]?.answer||'');
 card.innerHTML='<div class="question-top"><span class="qnum">'+esc(q.id)+'</span><span class="mark '+(d.ticks[q.id]?'good':d.graded?'bad':'neutral')+'">'+(d.done?(d.ticks[q.id]?'本轮已掌握':'待巩固'):d.graded?'已批改':'待练习')+'</span></div><div class="prompt">'+q.prompt+'</div><label class="answer-label" for="ans-'+q.id+'">我的回答</label>'+(mode==='scene'?'<textarea class="qanswer" id="ans-'+q.id+'" data-answer="'+q.id+'" rows="3">'+esc(value)+'</textarea>':'<input class="qanswer" id="ans-'+q.id+'" data-answer="'+q.id+'" autocomplete="off" value="'+esc(value)+'">')+'<div class="mark-controls"><label class="tick-label"><input type="checkbox" data-tick="'+q.id+'"><b>这题我独立答对了</b></label><button class="skip" type="button">'+(skipped?'撤销“暂时不会”':'暂时不会')+'</button></div><div class="round-marks"><span>三轮记录（核对后勾选）</span>'+[1,2,3].map(n=>'<label><input type="checkbox" data-round-no="'+n+'" '+(roundData(mode,n)?.ticks[q.id]?'checked':'')+'><span>第'+n+'轮</span></label>').join('')+'</div>'+(show&&d.graded?'<div class="answer-reveal"><b>参考答案：</b>'+esc(q.answerText||q.answer)+'<p>'+esc(q.why||'')+'</p></div>':'');
 section.querySelector('.lesson-items').appendChild(card);const field=card.querySelector('.qanswer');field.disabled=locked||skipped;field.oninput=()=>nativeInput(q,'answer',field.value);
 const tick=card.querySelector('[data-tick]');tick.checked=!!d.ticks[q.id];tick.disabled=!d.graded||d.done||skipped;tick.onchange=()=>{nativeTick(q,r,tick.checked);card.querySelector('[data-round-no="'+r+'"]').checked=tick.checked;};
 for(const t of card.querySelectorAll('[data-round-no]')){const n=Number(t.dataset.roundNo);t.disabled=n!==r||!d.graded||d.done||skipped;t.onchange=()=>{nativeTick(q,n,t.checked);tick.checked=t.checked;};}
 const skip=card.querySelector('.skip');skip.disabled=locked;skip.onclick=()=>{d.skipped[q.id]=!skipped;persist();render();};
 }
 }
 if(!wanted.length)host.innerHTML='<div class="empty">本轮没有待巩固题，可直接完成本轮核对。</div>';
 document.getElementById('current-label').textContent=label[mode]+' · 第'+r+'轮';document.getElementById('headline-count').textContent=wanted.length;document.getElementById('headline-total').textContent='/ '+qs.length+'题';document.getElementById('headline-note').textContent=r===1?'第1轮独立练习':'只复练本批次上一轮未掌握题';
 document.getElementById('result').hidden=!d.graded||!show;document.getElementById('result').textContent=d.graded?'本轮已批改，核对后勾选独立答对的题，再完成本轮。':'';
 document.getElementById('review-only').checked=nativeFilter[mode];document.getElementById('review-only').onchange=e=>{nativeFilter[mode]=e.target.checked;render();};
}
function renderNative(){
 if(!originalRoot.isConnected)app.before(originalRoot);app.innerHTML='';app.hidden=true;nativeTools();
 originalRoot.querySelectorAll('[data-mode-switch]').forEach(b=>{b.classList.toggle('active',b.dataset.modeSwitch===mode);b.onclick=()=>nativeSelectMode(b.dataset.modeSwitch);});
 originalRoot.querySelectorAll('.navbtn,button.tab').forEach(b=>{const p=b.dataset.panel;const m=p==='m'?'memory':p==='s'?'scene':p==='r'?'summary':p;b.classList.toggle('active',m===nativePanel);b.onclick=()=>{if(m==='memory'||m==='scene')nativeSelectMode(m);else{nativePanel='summary';render();}};});
 originalRoot.querySelectorAll('.panel').forEach(p=>{const selected=C.grade===6?nativePanel+'-panel':nativePanel==='memory'?'memoryPanel':nativePanel==='scene'?'scenePanel':'reportPanel';p.classList.toggle('active',p.id===selected);});
 originalRoot.querySelectorAll('[data-rselect] button,[data-round-switch]').forEach(b=>{const m=b.closest('[data-rselect]')?.dataset.rselect||mode;const n=Number(b.dataset.r||b.dataset.roundSwitch),current=m===mode?r:nativeRounds[m];b.disabled=n>1&&!roundData(m,n-1)?.done;b.classList.toggle(C.air?'active':'selected',n===current);b.onclick=()=>{mode=m;nativeSelectRound(n);};});
 originalRoot.querySelectorAll('select[data-round-select]').forEach(s=>{const m=s.dataset.roundSelect==='m'?'memory':'scene';s.value=m===mode?r:nativeRounds[m];[...s.options].forEach(o=>o.disabled=+o.value>1&&!roundData(m,+o.value-1)?.done);s.onchange=()=>{mode=m;nativeSelectRound(+s.value);};});
 if(C.air)nativeAirCards();else nativeStaticCards();nativeActionBars();nativeSummary();
 for(const m of ['memory','scene']){const b=document.getElementById('filter-'+m);if(b)b.onclick=()=>{nativeFilter[m]=!nativeFilter[m];render();};}
 for(const id of ['student','cloudChildName','cloudSemester','semester','cloudPhase']){const field=document.getElementById(id);if(!field)continue;const property=id==='student'||id==='cloudChildName'?'child':id==='cloudPhase'?'stage':'semester';if(field.tagName==='SELECT'&&!Array.from(field.options).some(o=>o.value===batch[property])){for(const value of ['日常','期中','期末'])if(!Array.from(field.options).some(o=>o.value===value))field.add(new Option(value,value));}field.value=batch[property];field.onchange=()=>{const v=field.value.trim();if(!v||v===batch[property])return;const meta={...nativeMeta(),[property]:v};createBatch(meta);};}
 originalRoot.querySelectorAll('[data-original-onclick]').forEach(b=>{const code=b.dataset.originalOnclick;if(code.includes('printSheet'))b.onclick=()=>{const m=code.includes('scene')?'scene':'memory';originalRoot.querySelectorAll('.panel').forEach(p=>p.classList.toggle('printing',p.id===m+'-panel'));window.print();};if(code.includes('exportData'))b.onclick=exportAll;if(code.includes('resetData')){b.textContent='空白复练（保留历史）';b.onclick=()=>{view='home';home();};}});
 for(const id of ['printNow'])if(document.getElementById(id))document.getElementById(id).onclick=()=>window.print();
 for(const id of ['backupOpen','doBackup','downloadBackup'])if(document.getElementById(id))document.getElementById(id).onclick=()=>{const field=document.getElementById('backuptext');if(field){field.value=JSON.stringify({version:2,quizId:C.quizId,batches:batches()},null,2);nativePanel='summary';render();}else exportAll();};
 if(document.getElementById('copyBackup'))document.getElementById('copyBackup').onclick=()=>navigator.clipboard.writeText(document.getElementById('backuptext').value);
 if(document.getElementById('restoreBackup'))document.getElementById('restoreBackup').onclick=()=>importNativeBackup(document.getElementById('backuptext').value);
 originalRoot.querySelectorAll('input[type=file]').forEach(input=>input.onchange=async()=>{if(input.files[0])await importNativeBackup(await input.files[0].text());input.value='';});
 if(document.getElementById('testSave'))document.getElementById('testSave').onclick=()=>{persist();document.getElementById('statusMsg').textContent='已保存本批次；原有历史记录保留。';};
 const wrong=document.getElementById('cloudWrongList');if(wrong)wrong.onclick=nativeMastery;
 const restore=$('cloud-history');if(restore)restore.textContent='查看云端历史记录';
 let report=$('cloud-records');if(!report){report=document.createElement('div');report.id='cloud-records';report.hidden=true;$('cloud-status').after(report);}bindCloud();
 for(const id of ['saveLabel','save-status','storage-status'])if(document.getElementById(id))document.getElementById(id).textContent='本批次自动保存在当前设备；历史草稿、勾选和成绩保留。';
}
async function importNativeBackup(raw){
 try{
  const data=JSON.parse(raw);let count=0;
  function archive(state,term){if(!state||typeof state!=='object')throw Error('备份记录格式无效');localStorage.setItem(IMPORT_PREFIX+uuid(),JSON.stringify({state,semester:term||nativeMeta().semester,importedAt:new Date().toISOString()}));count++;}
  function addBatch(b){if(b.quizId!==C.quizId||b.version!==2||!b.id||!b.rounds)throw Error('备份属于其他试卷或格式不完整');const key=PREFIX+b.id,raw=JSON.stringify(b),old=localStorage.getItem(key);if(old===raw)return;if(old===null)localStorage.setItem(key,raw);else{const copy=structuredClone(b);copy.id=uuid();copy.imported=true;copy.createdAt=new Date().toISOString();localStorage.setItem(PREFIX+copy.id,JSON.stringify(copy));}count++;}
  if(data.records){for(const [key,raw] of Object.entries(data.records)){const value=typeof raw==='string'?JSON.parse(raw):raw;if(key.startsWith(PREFIX))addBatch(value);else if(key.startsWith(IMPORT_PREFIX))archive(value.state,value.semester);else if(key===C.localKey||C.air&&key.startsWith(C.localKey))archive(value,C.air?key.slice(C.localKey.length):nativeMeta().semester);}}
  else if(data.version===2&&Array.isArray(data.batches))for(const b of data.batches)addBatch(b);
  else{const state=data.type==='son-science-backup'?data.data:data;if(C.air?!state?.modes:!(state?.draft||state?.values))throw Error('无法识别本试卷备份格式');archive(state,nativeMeta().semester);}
  alert('已导入 '+count+' 份记录；已有草稿、勾选和成绩未被覆盖。可在历史记录中查看。');showHistory();
 }catch(e){alert('导入未完成：'+e.message);}
}

async function loadBank(){
 if(C.air){const res=await fetch('air-unit-data.js');if(!res.ok)throw Error('空气题库加载失败');const raw=await res.text();const rows=JSON.parse(raw.match(/window.AIR_UNIT_QUESTIONS=(\[.*\]);/)[1]);return rows.map(q=>({id:q.id,mode:q.mode,lesson:q.lesson,answerText:q.a,why:q.why,title:q.id+' · 第'+q.lesson+'课',prompt:esc(q.q),fields:['answer'],answer:q.a+' '+q.why}));}
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
(async()=>{try{bank=await loadBank();if(!bank.length)throw Error('题库为空');if(originalRoot){const active=localStorage.getItem('science-review-active|'+C.quizId);const existing=active&&read(PREFIX+active);if(existing)openBatch(existing.id);else createBatch({child:C.defaultName,semester:'2026秋',stage:'日常'},null,null,false);}else render();const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';s.onerror=()=>message('云端组件加载失败，本机练习仍可保存。');s.onload=async()=>{try{const c=window.supabase.createClient('https://iqlnwzxmtjjgzisufljd.supabase.co','sb_publishable_jnY3xbWPgPFBd6naW35bXQ_tzZcNOTE');const session=await c.auth.getSession();if(session.data?.session){client=c;await identity();if(unlocked)message('已连接原家庭档案；完成新轮次后自动同步。');}}catch(e){message('云端暂不可用，本机作答仍可保存。');}};document.head.appendChild(s);}catch(e){app.hidden=false;app.textContent='加载失败：'+e.message+'。请刷新或联系家长，原有记录保留。';}})();
})();
