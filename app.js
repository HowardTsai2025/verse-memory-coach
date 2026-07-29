const $ = (s) => document.querySelector(s);
const stateKey = "verseMemoryCoach.v1";
const themeKey = "verseMemoryCoach.theme";
let state = JSON.parse(localStorage.getItem(stateKey) || "null");
let session = null;

const paperDefinitions = {
  A:"A卷｜克漏字",
  B:"B卷｜段落填空",
  C:"C卷｜中文全默",
  D:"D卷｜英文全默"
};
const createProgress = () => Object.fromEntries(VERSES.map(v=>[
  v.id,
  {level:0,attempts:0,correct:0,last:null,needsReview:false}
]));
const allowedMinutes = [5,10,15,20];
const validMinutes = value => allowedMinutes.includes(Number(value)) ? Number(value) : 10;
const save = () => localStorage.setItem(stateKey, JSON.stringify(state));
function migrateState(){
  if(!state)return;
  if(Object.hasOwn(state,"xp"))delete state.xp;
  if(!paperDefinitions[state.paper])state.paper="A";
  const legacyMinutes=validMinutes(state.minutes||state.defaultMinutes);
  state.defaultMinutes=validMinutes(state.defaultMinutes||legacyMinutes);
  if(!state.papers){
    const legacyProgress=state.progress||createProgress();
    state.papers={[state.paper]:{minutes:legacyMinutes,progress:legacyProgress}};
    delete state.progress;
  }
  Object.values(state.papers).forEach(paper=>{
    paper.minutes=validMinutes(paper.minutes||legacyMinutes);
    if(!paper.progress)paper.progress=createProgress();
  });
  delete state.minutes;
  if(!state.papers[state.paper])state.papers[state.paper]={minutes:state.defaultMinutes,progress:createProgress()};
  save();
}
function getPaperData(paper=state.paper){
  if(!state.papers[paper]){
    state.papers[paper]={minutes:state.defaultMinutes,progress:createProgress()};
  }
  state.papers[paper].minutes=validMinutes(state.papers[paper].minutes);
  return state.papers[paper];
}
function getPaperProgress(paper=state.paper){
  return getPaperData(paper).progress;
}
migrateState();
const normalize = s => (s||"").replace(/[，。；：、？！「」『』（）()“”"'﹐,.;:!?\s]/g,"").replace(/裡/g,"裏");
const today = () => new Date().toISOString().slice(0,10);
const punctuation = /[，。；：、？！「」『』（）()“”"'﹐,.;:!?\s]/;
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const blankCell = (segment,offset) => `<span class="blank-cell" data-blank-segment="${segment}" data-blank-offset="${offset}" aria-hidden="true"></span>`;
const eligibleIndexes = text => [...text].map((char,index) => punctuation.test(char) ? null : index).filter(index => index !== null);
const getVerseText = verse => state.paper==="D" ? ENGLISH_VERSES[verse.id].text : verse.text;
const chineseBookNames = {
  "太":"馬太福音","林前":"哥林多前書","彼前":"彼得前書","約壹":"約翰一書",
  "彼後":"彼得後書","賽":"以賽亞書","羅":"羅馬書","弗":"以弗所書",
  "多":"提多書","約":"約翰福音","結":"以西結書","來":"希伯來書",
  "啓":"啓示錄","腓":"腓立比書"
};
const englishBookNames = {
  "Matt.":"Matthew","1 Cor.":"1 Corinthians","1 Pet.":"1 Peter","1 John":"1 John",
  "2 Pet.":"2 Peter","Isa.":"Isaiah","Rom.":"Romans","Eph.":"Ephesians",
  "Titus":"Titus","John":"John","Ezek.":"Ezekiel","Heb.":"Hebrews",
  "Rev.":"Revelation","Phil.":"Philippians"
};
const expandReference = (reference,names) => {
  const book=Object.keys(names).sort((a,b)=>b.length-a.length).find(name=>reference.startsWith(`${name} `));
  return book ? `${names[book]} ${reference.slice(book.length).trim()}` : reference;
};
const getVerseReference = verse => state.paper==="D"
  ? expandReference(ENGLISH_VERSES[verse.id].reference,englishBookNames)
  : expandReference(verse.reference,chineseBookNames);
const buildPrompt = (text,hiddenIndexes) => {
  const segments=[];
  let html="";
  let current="";
  let segment=-1;
  let offset=0;
  let insideHidden=false;
  [...text].forEach((char,index)=>{
    if(hiddenIndexes.has(index) && !punctuation.test(char)){
      if(!insideHidden){segment++;offset=0;current="";insideHidden=true;}
      current+=char;
      html+=blankCell(segment,offset);
      offset++;
    }else{
      if(insideHidden){segments.push(current);insideHidden=false;}
      html+=escapeHtml(char);
    }
  });
  if(insideHidden)segments.push(current);
  return {html,segments};
};

function newState(nickname,paper,minutes){
  const initialMinutes=validMinutes(minutes);
  return {nickname,paper,defaultMinutes:initialMinutes,streak:0,lastStudy:null,
    papers:{[paper]:{minutes:initialMinutes,progress:createProgress()}}};
}
function show(id){["onboarding","dashboard","quiz","complete"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));}
function updateThemeToggle(){
  const isDark=document.documentElement.dataset.theme==="dark";
  $("#themeToggle").textContent=isDark?"淺色模式":"深色模式";
  $("#themeToggle").setAttribute("aria-pressed",String(isDark));
  document.querySelector('meta[name="theme-color"]').content=isDark?"#1c211e":"#f3f1eb";
}
function toggleTheme(){
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=next;
  localStorage.setItem(themeKey,next);
  updateThemeToggle();
}
function updateStreak(){
  if(!state.lastStudy) return;
  const d=(new Date(today())-new Date(state.lastStudy))/86400000;
  if(d>1) state.streak=0;
}
function renderDashboard(){
  updateStreak(); show("dashboard"); $("#resetBtn").classList.remove("hidden");
  const paperData=getPaperData();
  const progress=paperData.progress;
  $("#welcomeName").textContent=state.nickname;
  $("#paperBadge").textContent=`${state.paper}卷`;
  const mastered=Object.values(progress).filter(x=>x.level>=4).length;
  const avg=Object.values(progress).reduce((a,b)=>a+b.level,0)/(36*5);
  $("#streakStat").textContent=state.streak;
  $("#masteredStat").textContent=`${mastered}/36`;
  $("#readiness").textContent=`準備度 ${Math.round(avg*100)}%`;
  $("#progressBar").style.width=`${Math.round(avg*100)}%`;
  $("#dailyTitle").textContent=`${paperData.minutes}分鐘個人化練習`;
  document.querySelectorAll("[data-daily-minutes]").forEach(button=>{
    const selected=Number(button.dataset.dailyMinutes)===paperData.minutes;
    button.classList.toggle("selected",selected);
    button.setAttribute("aria-pressed",String(selected));
  });
  $("#dailyHint").textContent=mastered===0?"先從系統挑選的基礎題開始，答錯的經節會更快再次出現。":`目前已有 ${mastered} 節達到熟練；今天優先複習較弱與較久未練的內容。`;
  $("#practiceBtn").textContent=Object.values(progress).every(x=>x.attempts===0)?"開始程度診斷":"開始今日練習";
  $("#verseGrid").innerHTML=VERSES.map(v=>`<button type="button" class="verse-dot" data-verse-id="${v.id}" data-level="${progress[v.id].level}" aria-label="查看${escapeHtml(getVerseReference(v))}完整經文">${escapeHtml(getVerseReference(v))}</button>`).join("");
  save();
}
function showVerseDialog(verseId){
  const verse=VERSES.find(item=>item.id===Number(verseId));
  if(!verse)return;
  $("#verseDialogLesson").textContent=state.paper==="D"?"英文經文":verse.lesson;
  $("#verseDialogReference").textContent=getVerseReference(verse);
  $("#verseDialogText").textContent=getVerseText(verse);
  $("#verseDialog").showModal();
}
function renderPaperOptions(){
  $("#paperOptions").innerHTML=Object.entries(paperDefinitions).map(([paper,label])=>{
    const paperData=state.papers[paper];
    const progress=paperData?.progress;
    const values=progress?Object.values(progress):[];
    const mastered=values.filter(item=>item.level>=4).length;
    const readiness=values.length?Math.round(values.reduce((sum,item)=>sum+item.level,0)/(36*5)*100):0;
    const hasStarted=values.some(item=>item.attempts>0);
    const status=paper===state.paper?"目前使用":hasStarted?"繼續練習":"開始診斷";
    return `<button type="button" class="paper-option${paper===state.paper?" current":""}" data-paper="${paper}" aria-label="切換到${escapeHtml(label)}">
      <span><strong>${escapeHtml(label)}</strong><small>${hasStarted?`準備度 ${readiness}%・熟練 ${mastered}/36`:"尚未開始"}・${validMinutes(paperData?.minutes||state.defaultMinutes)}分鐘</small></span>
      <span class="paper-option-status">${status}</span>
    </button>`;
  }).join("");
}
function showPaperDialog(){
  renderPaperOptions();
  $("#paperDialog").showModal();
}
function pickQuestions(){
  const progress=getPaperProgress();
  const count=Math.max(5,Math.min(12,Math.round(getPaperData().minutes*.7)));
  const scored=VERSES.map(v=>{
    const p=progress[v.id];
    const weakness=(5-p.level)*3;
    const freshness=p.last?Math.min(10,(Date.now()-new Date(p.last))/86400000):10;
    const reviewPriority=p.needsReview?12:0;
    return {v,score:weakness+freshness+reviewPriority+Math.random()*4};
  }).sort((a,b)=>b.score-a.score);
  return scored.slice(0,count).map(x=>x.v);
}
function makePrompt(v){
  const text=getVerseText(v);
  if(state.paper==="D"){
    const firstBreak=text.search(/\s/);
    const firstWord=firstBreak<0?text:text.slice(0,firstBreak);
    const remainder=firstBreak<0?"":text.slice(firstBreak).trim();
    return {
      html:`<span class="english-first-word">${escapeHtml(firstWord)}</span><span class="english-revealed" aria-live="polite"></span><span class="english-blank-line" aria-hidden="true"></span>`,
      segments:[remainder],
      hintMode:"word",
      hintUnits:remainder.split(/\s+/).filter(Boolean)
    };
  }
  let hiddenIndexes;
  if(state.paper==="A"){
    const candidates=eligibleIndexes(text);
    const blankCount=Math.min(candidates.length,2+Math.floor(Math.random()*3));
    const start=Math.max(0,Math.floor(Math.random()*Math.max(1,candidates.length-blankCount+1)));
    hiddenIndexes=new Set(candidates.slice(start,start+blankCount));
  }
  else if(state.paper==="B"){
    const candidates=eligibleIndexes(text);
    const blankCount=Math.min(candidates.length,Math.max(6,Math.min(12,Math.round(candidates.length*.2))));
    const start=Math.max(0,Math.floor(Math.random()*Math.max(1,candidates.length-blankCount+1)));
    hiddenIndexes=new Set(candidates.slice(start,start+blankCount));
  }
  else if(state.paper==="C"){
    const candidates=eligibleIndexes(text);
    const hintIndex=candidates[0];
    hiddenIndexes=new Set(candidates.filter(index=>index!==hintIndex));
  }
  else hiddenIndexes=new Set();
  return buildPrompt(text,hiddenIndexes);
}
function begin(){
  session={
    paper:state.paper,
    progressBefore:JSON.parse(JSON.stringify(getPaperProgress())),
    questions:pickQuestions(),
    index:0,
    correct:0,
    answered:false
  };
  show("quiz"); renderQuestion();
}
function exitQuiz(){
  if(!session)return;
  const shouldExit=confirm("確定離開本次練習？\n\n本次練習的作答紀錄將不會保留。");
  if(!shouldExit)return;
  state.papers[session.paper].progress=session.progressBefore;
  session=null;
  save();
  renderDashboard();
}
function renderQuestion(){
  const v=session.questions[session.index]; session.answered=false;
  const progress=getPaperProgress();
  session.currentPrompt=makePrompt(v);
  session.activeSegment=0;
  session.hintCounts=session.currentPrompt.segments.map(()=>0);
  session.hintUsed=false;
  $("#quizMode").textContent=Object.values(progress).every(x=>x.attempts===0)?"程度診斷":"今日練習";
  $("#quizRef").textContent=getVerseReference(v);
  $("#quizCounter").textContent=`${session.index+1}/${session.questions.length}`;
  $("#quizPrompt").innerHTML=session.currentPrompt.html;
  $("#answerFields").innerHTML=session.currentPrompt.segments.map((segment,index)=>{
    const isEnglish=state.paper==="D";
    const length=isEnglish?segment.split(/\s+/).filter(Boolean).length:normalize(segment).length;
    const unit=isEnglish?"詞":"字";
    return `<label class="answer-field${index===0?" active":""}"><span>第 ${index+1} 組・${length} ${unit}</span><textarea class="segment-answer" data-segment="${index}" aria-label="第 ${index+1} 組缺字" placeholder="${isEnglish?`填入 ${length} 個英文單字`:`填入 ${length} 個字`}" rows="1" autocomplete="off"></textarea></label>`;
  }).join("");
  updateAnswerGuide();
  updateHintButton();
  $("#feedback").className="feedback hidden";
  $("#submitBtn").classList.remove("hidden"); $("#nextBtn").classList.add("hidden");
}
function updateAnswerGuide(){
  if(!session?.currentPrompt)return;
  const segments=session.currentPrompt.segments;
  const completed=[...document.querySelectorAll(".segment-answer")].filter((input,index)=>normalize(input.value).length===normalize(segments[index]).length).length;
  $("#answerGuide").textContent=state.paper==="D"
    ?"第一個英文單字已提供，請輸入其後的完整經文。"
    :segments.length>1
    ?`請由左到右分組填寫（已完成 ${completed}/${segments.length} 組）`
    :`請填入方格中的 ${normalize(segments[0]).length} 個字。`;
}
function updateHintButton(){
  const count=session.hintCounts[session.activeSegment];
  const units=session.currentPrompt.hintUnits||[...session.currentPrompt.segments[session.activeSegment]];
  const length=units.length;
  const unit=session.currentPrompt.hintMode==="word"?"詞":"字";
  $("#hintBtn").textContent=count>=length?"本組提示完畢":`提示一${unit}`;
  $("#hintBtn").disabled=count>=length;
}
function revealHint(){
  const index=session.activeSegment;
  session.activeSegment=index;
  document.querySelectorAll(".answer-field").forEach((field,i)=>field.classList.toggle("active",i===index));
  const target=session.currentPrompt.hintUnits||[...session.currentPrompt.segments[index]];
  session.hintCounts[index]=Math.min(target.length,session.hintCounts[index]+1);
  session.hintUsed=true;
  const offset=session.hintCounts[index]-1;
  if(session.currentPrompt.hintMode==="word"){
    document.querySelector(".english-revealed").textContent=` ${target.slice(0,session.hintCounts[index]).join(" ")}`;
  }else{
    const cell=document.querySelector(`[data-blank-segment="${index}"][data-blank-offset="${offset}"]`);
    cell.textContent=target[offset];
    cell.classList.add("revealed");
    cell.removeAttribute("aria-hidden");
    cell.setAttribute("aria-label",`提示字：${target[offset]}`);
  }
  updateHintButton();
}
function resizeAnswerField(field){
  field.style.height="auto";
  const borderHeight=field.offsetHeight-field.clientHeight;
  field.style.height=`${field.scrollHeight+borderHeight}px`;
}
function score(){
  if(session.answered)return;
  const v=session.questions[session.index];
  const inputs=[...document.querySelectorAll(".segment-answer")];
  const answers=inputs.map(input=>normalize(input.value));
  const targets=session.currentPrompt.segments.map(normalize);
  if(answers.some(answer=>!answer)){alert("請完成每一組答案。");return;}
  const results=answers.map((answer,index)=>answer===targets[index]);
  const pass=results.every(Boolean);
  const independentPass=pass&&!session.hintUsed;
  inputs.forEach((input,index)=>{
    input.classList.toggle("field-correct",results[index]);
    input.classList.toggle("field-wrong",!results[index]);
  });
  const p=getPaperProgress()[v.id]; p.attempts++; p.last=today();
  if(independentPass){p.correct++;p.level=Math.min(5,p.level+1);p.needsReview=false;session.correct++;}
  else if(pass){p.needsReview=true;}
  else{p.level=Math.max(0,p.level-1);p.needsReview=true;}
  session.answered=true;
  $("#feedback").className=`feedback ${pass?"good":"bad"}`;
  const wrongGroups=results.map((correct,index)=>correct?null:index+1).filter(Boolean);
  const resultTitle=independentPass?"完全正確！":pass?"答對了，但本題使用過提示":`第 ${wrongGroups.join("、")} 組需要修正`;
  $("#feedback").innerHTML=`<strong>${resultTitle}</strong><br>${pass&&session.hintUsed?"這一節會安排再次複習。<br>":""}<span>正確經文：${getVerseText(v)}</span>`;
  $("#hintBtn").disabled=true;
  $("#submitBtn").classList.add("hidden"); $("#nextBtn").classList.remove("hidden");
}
function finish(){
  const old=state.lastStudy;
  if(old!==today()){
    const yd=new Date(); yd.setDate(yd.getDate()-1);
    state.streak=(old===yd.toISOString().slice(0,10))?state.streak+1:1;
  }
  state.lastStudy=today(); save(); show("complete");
  $("#sessionAccuracy").textContent=`${Math.round(session.correct/session.questions.length*100)}%`;
  $("#sessionReviewed").textContent=session.questions.length;
}
$("#startBtn").addEventListener("click",()=>{
  const n=$("#nickname").value.trim(), p=$("#paper").value;
  if(!n){alert("請先輸入暱稱。");return;}
  state=newState(n,p,$("#minutes").value); save(); renderDashboard();
});
$("#themeToggle").addEventListener("click",toggleTheme);
$("#practiceBtn").addEventListener("click",begin);
$("#dailyMinuteOptions").addEventListener("click",event=>{
  const option=event.target.closest("[data-daily-minutes]");
  if(!option)return;
  getPaperData().minutes=validMinutes(option.dataset.dailyMinutes);
  save();
  renderDashboard();
});
$("#exitQuizBtn").addEventListener("click",exitQuiz);
$("#answerFields").addEventListener("input",event=>{
  if(event.target.classList.contains("segment-answer"))resizeAnswerField(event.target);
  updateAnswerGuide();
});
$("#answerFields").addEventListener("focusin",event=>{
  if(!event.target.classList.contains("segment-answer"))return;
  session.activeSegment=Number(event.target.dataset.segment);
  document.querySelectorAll(".answer-field").forEach((field,index)=>field.classList.toggle("active",index===session.activeSegment));
  updateHintButton();
});
$("#submitBtn").addEventListener("click",score);
$("#nextBtn").addEventListener("click",()=>{session.index++; session.index>=session.questions.length?finish():renderQuestion();});
$("#hintBtn").addEventListener("click",revealHint);
$("#backBtn").addEventListener("click",renderDashboard);
$("#verseGrid").addEventListener("click",event=>{
  const button=event.target.closest("[data-verse-id]");
  if(button)showVerseDialog(button.dataset.verseId);
});
$("#closeVerseDialog").addEventListener("click",()=>$("#verseDialog").close());
$("#verseDialog").addEventListener("click",event=>{
  if(event.target===$("#verseDialog"))$("#verseDialog").close();
});
$("#switchPaperBtn").addEventListener("click",showPaperDialog);
$("#closePaperDialog").addEventListener("click",()=>$("#paperDialog").close());
$("#paperDialog").addEventListener("click",event=>{
  if(event.target===$("#paperDialog"))$("#paperDialog").close();
});
$("#paperOptions").addEventListener("click",event=>{
  const option=event.target.closest("[data-paper]");
  if(!option)return;
  state.paper=option.dataset.paper;
  getPaperProgress();
  session=null;
  save();
  $("#paperDialog").close();
  renderDashboard();
});
$("#resetBtn").addEventListener("click",()=>{if(confirm("確定清除 A、B、C、D 卷在這部裝置上的所有學習紀錄？")){localStorage.removeItem(stateKey);location.reload();}});
updateThemeToggle();
if(state) renderDashboard(); else show("onboarding");
