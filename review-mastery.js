/* Evidence-based mastery: unfinished rounds never become errors. */
(function(root){
'use strict';
const DAY=24*60*60*1000;
function classify(questions,events){
 const seen=new Set();const valid=events.filter(e=>{if(!e.valid||seen.has(e.key))return false;seen.add(e.key);return true;});
 return questions.map(q=>{
 const rows=valid.filter(e=>e.questionId===q.id).sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0));
 const last=rows.at(-1);const wrongs=rows.filter(e=>!e.correct&&e.answered&&!e.skipped),hadWrong=wrongs.length>0;
 if(!last)return {...q,level:'unseen',hadWrong:false,wrongCount:0,reason:'尚无已完成核对记录；未做不算做错'};
 if(!last.correct)return {...q,level:'unresolved',hadWrong,wrongCount:wrongs.length,reason:last.skipped?'最近一次有效核对选择“暂时不会”':last.answered?'最近一次有效核对仍未掌握':'最近有效记录无独立答对证据',last};
 let suffix=[];for(let i=rows.length-1;i>=0&&rows[i].correct;i--)suffix.push(rows[i]);
 const independent=suffix.filter(e=>e.independent&&e.batchId&&Number.isFinite(Date.parse(e.at)));
 const stable=independent.some(a=>independent.some(b=>a.batchId!==b.batchId&&Math.abs(Date.parse(a.at)-Date.parse(b.at))>=DAY));
 return {...q,level:stable?'stable':'unstable',hadWrong,wrongCount:wrongs.length,reason:stable?'不同独立批次至少两次无提示答对，间隔不少于24小时':hadWrong?'曾错后已纠正，仍需另日独立抽测':'暂时掌握，仍需另日独立验证',last};
 });
}
function plan(rows,sampleLimit=5){const required=rows.filter(q=>q.level==='unresolved').map(q=>q.id);const pool=rows.filter(q=>q.level==='unstable'&&q.hadWrong).sort((a,b)=>(Date.parse(a.last?.at)||0)-(Date.parse(b.last?.at)||0)||b.wrongCount-a.wrongCount||a.id.localeCompare(b.id));const sampled=pool.slice(0,Math.max(0,sampleLimit)).map(q=>q.id);return {required,sampled,ids:[...required,...sampled]};}
const api={classify,plan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScienceMastery=api;
})(typeof window!=='undefined'?window:globalThis);
