// pages/index.js  —  Hart Dental Task Communicator (Production)
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════════
//  SUPABASE STORAGE  (replaces window.storage)
// ══════════════════════════════════════════════════════════════
async function loadTasks() {
  const { data, error } = await supabase.from("dental_tasks").select("payload");
  if (error) { console.error(error); return []; }
  return (data || []).map(r => r.payload);
}

async function saveTasks(tasks) {
  // Upsert each task individually so we don't wipe others' concurrent changes
  const rows = tasks.map(t => ({ id: t.id, payload: t }));
  const { error } = await supabase.from("dental_tasks").upsert(rows, { onConflict: "id" });
  if (error) console.error("saveTasks error:", error);
}

async function saveOneTask(task) {
  const { error } = await supabase
    .from("dental_tasks")
    .upsert({ id: task.id, payload: task }, { onConflict: "id" });
  if (error) console.error("saveOneTask error:", error);
}

async function loadRecurring() {
  const { data, error } = await supabase.from("dental_recurring").select("payload");
  if (error) return [];
  return (data || []).map(r => r.payload);
}

async function saveRecurring(templates) {
  const rows = templates.map(t => ({ id: t.id, payload: t }));
  await supabase.from("dental_recurring").upsert(rows, { onConflict: "id" });
}

// ══════════════════════════════════════════════════════════════
//  STAFF
// ══════════════════════════════════════════════════════════════
const STAFF = [
  // ← Add real phone numbers here, e.g. phone:"+13051234567"
  { id:"mgr",  name:"Dr. Olivia Hart", role:"manager",  initials:"OH", avatar:"#0f3d52", phone:"" },
  { id:"emp1", name:"Maria Lopez",     role:"employee", title:"Dental Hygienist",   initials:"ML", avatar:"#1a6b5a", phone:"" },
  { id:"emp2", name:"James Park",      role:"employee", title:"Dental Assistant",   initials:"JP", avatar:"#5a4520", phone:"" },
  { id:"emp3", name:"Priya Sharma",    role:"employee", title:"Front Desk",         initials:"PS", avatar:"#4a2060", phone:"" },
  { id:"emp4", name:"Tom Rivera",      role:"employee", title:"Sterilization Tech", initials:"TR", avatar:"#1a4a20", phone:"" },
];
const employees = STAFF.filter(s => s.role==="employee");

// ══════════════════════════════════════════════════════════════
//  CLAUDE API
// ══════════════════════════════════════════════════════════════
async function callClaude(messages, system) {
  // Uses the secure /api/claude proxy — API key stays server-side
  const res = await fetch("/api/claude", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1500, system, messages }),
  });
  const d = await res.json();
  return d.content?.map(b=>b.text||"").join("")||"";
}

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const nowStr  = () => new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const today   = () => new Date().toDateString();
const uid     = () => Math.random().toString(36).slice(2,9);
const normalizeSteps = (steps=[]) => steps.map(s => typeof s==="string" ? {text:s,done:false} : s);

// ══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
async function requestNotifPerm() {
  if (!("Notification" in window)) return false;
  if (Notification.permission==="granted") return true;
  const p = await Notification.requestPermission();
  return p==="granted";
}
function fireNotif(title, body) {
  if (Notification.permission==="granted") {
    try { new Notification(title, { body, icon:"https://em-content.zobj.net/source/apple/354/tooth_1f9b7.png" }); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
//  RECURRING — auto-create today's tasks from templates
// ══════════════════════════════════════════════════════════════
function shouldFire(tmpl) {
  const last = tmpl.lastCreatedDate;
  const t    = today();
  if (!last) return true;
  if (tmpl.frequency==="daily")   return last !== t;
  if (tmpl.frequency==="weekly") {
    const diff = (new Date(t) - new Date(last)) / 86400000;
    return diff >= 7;
  }
  if (tmpl.frequency==="monthly") {
    const diff = (new Date(t) - new Date(last)) / 86400000;
    return diff >= 28;
  }
  return false;
}

async function processRecurring(existing) {
  const templates = await loadRecurring();
  let changed = false;
  const newTasks = [];
  for (const tmpl of templates) {
    if (!shouldFire(tmpl)) continue;
    newTasks.push({
      id:uid(), title:tmpl.title, description:tmpl.description,
      steps: normalizeSteps(tmpl.steps), deadline:"Today (recurring)",
      priority:tmpl.priority, notes:tmpl.notes,
      patientContext:tmpl.patientContext||"",
      assigneeId:tmpl.assigneeId, assigneeName:tmpl.assigneeName,
      managerId:tmpl.managerId, managerName:tmpl.managerName,
      status:"open", createdAt:nowStr(), recurringTemplateId:tmpl.id,
      acknowledgedAt:null, messages:[],
    });
    tmpl.lastCreatedDate = today();
    changed = true;
  }
  if (changed) {
    await saveRecurring(templates);
    const updated = [...existing, ...newTasks];
    await saveTasks(updated);
    return updated;
  }
  return existing;
}

// ══════════════════════════════════════════════════════════════
//  DESIGN TOKENS + CSS
// ══════════════════════════════════════════════════════════════
const G = {
  bg:"#eef2f1", surface:"#ffffff", card:"#f7faf9",
  navy:"#0b2233", teal:"#156b60", tealLight:"#dff2ef",
  tealMid:"#1f9080", tealBright:"#22a898",
  accent:"#e8a025", accentLight:"#fdf3df",
  red:"#c0392b", redLight:"#fdecea",
  green:"#1e6e3a", greenLight:"#e8f7f0",
  text:"#172020", sub:"#546868", border:"#d5e5e2",
  shadow:"0 2px 20px rgba(11,34,51,.07)",
  shadowMd:"0 6px 32px rgba(11,34,51,.12)",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;background:${G.bg};color:${G.text};-webkit-font-smoothing:antialiased;}
  textarea,input{resize:none;font-family:'DM Sans',sans-serif;}
  input,textarea,button{outline:none;border:none;background:none;}
  button{cursor:pointer;font-family:'DM Sans',sans-serif;}
  select{font-family:'DM Sans',sans-serif;outline:none;}
  ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${G.border};border-radius:4px;}

  .fade-up {animation:fadeUp .32s cubic-bezier(.22,1,.36,1) both;}
  .fade-in {animation:fadeIn .22s ease both;}
  .slide-in{animation:slideIn .35s cubic-bezier(.22,1,.36,1) both;}
  @keyframes fadeUp  {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn  {from{opacity:0}to{opacity:1}}
  @keyframes slideIn {from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
  .spin{animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
  .pulse-dot{animation:pulseDot 1.6s ease-in-out infinite;}
  @keyframes pulseDot{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}

  .opt-btn{transition:all .15s ease;border:2px solid ${G.border};background:${G.surface};border-radius:13px;width:100%;display:flex;align-items:center;gap:12px;padding:13px 15px;text-align:left;cursor:pointer;}
  .opt-btn:hover{transform:translateY(-1px);box-shadow:0 3px 12px rgba(0,0,0,.08);border-color:#a8ccc8;}
  .opt-btn.sel-teal{border-color:${G.tealMid};background:${G.tealLight};box-shadow:0 0 0 3px rgba(31,144,128,.1);transform:translateY(-1px);}
  .opt-btn.sel-amber{border-color:${G.accent};background:${G.accentLight};box-shadow:0 0 0 3px rgba(232,160,37,.1);transform:translateY(-1px);}

  .check-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-radius:10px;cursor:pointer;transition:background .15s;}
  .check-item:hover{background:${G.card};}
  .check-item.done-item{opacity:.55;}

  .tab-btn{padding:8px 16px;border-radius:20px;font-size:13px;font-weight:500;transition:all .18s;cursor:pointer;border:none;}
  .tab-btn.active{background:${G.navy};color:#fff;}
  .tab-btn:not(.active){color:${G.sub};background:transparent;}
  .tab-btn:not(.active):hover{background:${G.border};}

  .progress-fill{transition:width .4s cubic-bezier(.22,1,.36,1);}

  .ack-banner{background:linear-gradient(135deg,${G.accentLight},#fff8e8);border:1.5px solid ${G.accent};border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:14px;}
`;

// ══════════════════════════════════════════════════════════════
//  TINY SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════
function Avatar({ user, size=36 }) {
  return <div style={{width:size,height:size,borderRadius:"50%",background:user.avatar,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.34,fontWeight:600,letterSpacing:".4px",flexShrink:0}}>{user.initials}</div>;
}

function StatusTag({ status }) {
  const map={open:{bg:"#e3f0ff",c:"#1a4a9a"},inprogress:{bg:"#fff3cd",c:"#956300"},done:{bg:G.greenLight,c:G.green}};
  const labels={open:"Open",inprogress:"In Progress",done:"Done"};
  const s=map[status]||map.open;
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:600,background:s.bg,color:s.c,letterSpacing:".2px"}}>{labels[status]||status}</span>;
}

function PriTag({ priority }) {
  const map={Urgent:{bg:"#ffd0d0",c:"#9a1010"},High:{bg:"#ffe3e3",c:"#b82020"},Medium:{bg:G.accentLight,c:"#8a5500"},Low:{bg:G.greenLight,c:G.green}};
  const s=map[priority]||map.Medium;
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.c}}>{priority}</span>;
}

function Spinner({ size=20, color=G.tealMid }) {
  return <svg className="spin" width={size} height={size} fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.1)" strokeWidth="3"/><path d="M12 2a10 10 0 0110 10" stroke={color} strokeWidth="3" strokeLinecap="round"/></svg>;
}

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [sel, setSel] = useState(null);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"linear-gradient(150deg,#0b2233 0%,#0e3a30 55%,#1a4a3a 100%)"}}>
      <div className="fade-up" style={{textAlign:"center",marginBottom:36}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:52,height:52,borderRadius:16,background:G.tealMid,marginBottom:14,boxShadow:"0 8px 24px rgba(31,144,128,.4)"}}>
          <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 2.3 1.1 4.4 2.8 5.7V19a.5.5 0 00.5.5h.5V21h6v-1.5h.5a.5.5 0 00.5-.5v-4.8c1.7-1.3 2.8-3.4 2.8-5.7C19.1 5 16.1 2 12 2z" fill="white" opacity=".95"/></svg>
        </div>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,color:"#fff",fontWeight:600,letterSpacing:".5px"}}>Hart Dental</h1>
        <p style={{fontSize:12,color:"rgba(255,255,255,.4)",letterSpacing:"2.5px",textTransform:"uppercase",marginTop:4}}>Task Communicator</p>
      </div>
      <div className="fade-up" style={{background:"rgba(255,255,255,.06)",borderRadius:22,padding:"28px 28px 24px",width:"100%",maxWidth:440,border:"1px solid rgba(255,255,255,.1)"}}>
        <p style={{fontSize:13,color:"rgba(255,255,255,.45)",marginBottom:16,textAlign:"center"}}>Select your profile to continue</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {STAFF.map(u=>(
            <button key={u.id} onClick={()=>setSel(u.id)} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",borderRadius:13,textAlign:"left",transition:"all .18s",background:sel===u.id?"rgba(255,255,255,.14)":"rgba(255,255,255,.04)",border:`1.5px solid ${sel===u.id?"rgba(255,255,255,.3)":"rgba(255,255,255,.07)"}`}}>
              <Avatar user={u} size={40}/>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:500,fontSize:14}}>{u.name}</div>
                <div style={{color:"rgba(255,255,255,.4)",fontSize:12}}>{u.role==="manager"?"Office Manager":u.title}</div>
              </div>
              {u.role==="manager"&&<span style={{fontSize:10,background:G.accent,color:"#fff",padding:"2px 8px",borderRadius:20,fontWeight:700,letterSpacing:".5px"}}>MGR</span>}
              {sel===u.id&&<svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={G.tealMid}/><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          ))}
        </div>
        <button onClick={()=>sel&&onLogin(STAFF.find(s=>s.id===sel))} disabled={!sel}
          style={{marginTop:20,width:"100%",padding:"14px",borderRadius:13,fontWeight:600,fontSize:15,transition:"all .2s",background:sel?G.tealMid:"rgba(255,255,255,.08)",color:sel?"#fff":"rgba(255,255,255,.25)",boxShadow:sel?"0 4px 18px rgba(31,144,128,.35)":"none"}}>
          Enter Workspace →
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SURVEY QUESTION CARD
// ══════════════════════════════════════════════════════════════
function SurveyQuestion({ question, index, total, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const otherRef = useRef(null);
  useEffect(()=>{ if(showOther&&otherRef.current) otherRef.current.focus(); },[showOther]);

  const canGo = selected!==null || (showOther&&otherText.trim().length>0);
  const progress = (index/total)*100;

  function pick(opt){ setSelected(opt); setShowOther(false); setOtherText(""); }
  function go(){ if(canGo) onAnswer(question.question, showOther?otherText.trim():selected); }

  return (
    <div className="slide-in" style={{display:"flex",flexDirection:"column"}}>
      <div style={{marginBottom:22}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
          <span style={{fontSize:11,color:G.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"1px"}}>Question {index+1} of {total}</span>
          <span style={{fontSize:11,color:G.tealMid,fontWeight:600}}>{Math.round(progress)}%</span>
        </div>
        <div style={{height:5,background:G.border,borderRadius:5,overflow:"hidden"}}>
          <div className="progress-fill" style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${G.teal},${G.tealBright})`,borderRadius:5}}/>
        </div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:question.context?6:18}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:G.tealLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
          <svg width="14" height="14" fill={G.teal} viewBox="0 0 24 24"><path d="M12 2a5 5 0 015 5v1h1a3 3 0 010 6h-1v1a5 5 0 01-10 0v-1H6a3 3 0 010-6h1V7a5 5 0 015-5z"/></svg>
        </div>
        <h3 style={{fontSize:17,fontWeight:600,color:G.navy,lineHeight:1.45,paddingTop:3}}>{question.question}</h3>
      </div>
      {question.context&&<p style={{fontSize:12,color:G.sub,marginLeft:40,lineHeight:1.55,fontStyle:"italic",marginBottom:16}}>{question.context}</p>}
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
        {question.options.map((opt,i)=>{
          const isSel=selected===opt;
          return (
            <button key={i} onClick={()=>pick(opt)} className={`opt-btn${isSel?" sel-teal":""}`}>
              <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,border:`2px solid ${isSel?G.tealMid:G.border}`,background:isSel?G.tealMid:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                {isSel&&<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <span style={{fontSize:14,color:isSel?G.teal:G.text,fontWeight:isSel?500:400,lineHeight:1.4}}>{opt}</span>
            </button>
          );
        })}
        <button onClick={()=>{setSelected(null);setShowOther(true);}} className={`opt-btn${showOther?" sel-amber":""}`}>
          <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,border:`2px solid ${showOther?G.accent:G.border}`,background:showOther?G.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
            {showOther&&<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>}
          </div>
          <span style={{fontSize:14,color:showOther?G.accent:G.sub,fontWeight:showOther?500:400}}>✏️  Something else — type your own</span>
        </button>
        {showOther&&(
          <div className="fade-up" style={{border:`2px solid ${G.accent}`,borderRadius:13,background:G.accentLight,overflow:"hidden",marginTop:-2}}>
            <textarea ref={otherRef} value={otherText} onChange={e=>setOtherText(e.target.value)}
              placeholder="Type your answer…" rows={3}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),go())}
              style={{width:"100%",padding:"13px 15px",fontSize:14,color:G.text,lineHeight:1.55,background:"transparent"}}/>
          </div>
        )}
      </div>
      <button onClick={go} disabled={!canGo} style={{width:"100%",padding:"14px",borderRadius:13,fontWeight:600,fontSize:14,letterSpacing:".3px",transition:"all .2s",background:canGo?G.tealMid:G.border,color:canGo?"#fff":G.sub,boxShadow:canGo?"0 4px 16px rgba(31,144,128,.3)":"none"}}>
        {index+1===total?"Review Task →":"Next →"}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  NEW TASK WIZARD
// ══════════════════════════════════════════════════════════════
const FREQ_OPTS = ["None","Daily","Weekly","Monthly"];

function NewTaskWizard({ manager, onTaskCreated, onCancel }) {
  const [step, setStep]           = useState("form");
  const [assignee, setAssignee]   = useState(null);
  const [rawTask, setRawTask]     = useState("");
  const [patientCtx, setPatientCtx] = useState("");   // ← Patient context
  const [frequency, setFrequency] = useState("None"); // ← Recurring
  const [questions, setQuestions] = useState([]);
  const [taskTemplate, setTaskTpl]= useState(null);
  const [qIndex, setQIndex]       = useState(0);
  const [answers, setAnswers]     = useState({});
  const [finalTask, setFinalTask] = useState(null);
  const [sending, setSending]     = useState(false);

  const FALLBACK_Q = [
    {question:"When does this need to be done?",        options:["Within 30 min","Before next patient block","By end of today","Tomorrow morning"]},
    {question:"How urgent is this?",                    options:["Urgent - affects patients now","High - do soon","Normal - before end of shift","Low - when time allows"]},
    {question:"What does a completed task look like?",  options:["Per standard protocol","Manager inspects it","Patient-ready and documented","Report back when complete"]},
    {question:"Who needs to know when done?",           options:["Dr. Hart only","Front desk too","Whole team","No notification needed"]},
  ];

  // Single combined API call - questions + task template in one shot
  async function startSurvey() {
    if (!assignee||!rawTask.trim()) return;
    setStep("loading");

    const sys = `You are a dental office task assistant.
Return a JSON object with EXACTLY these two keys, no markdown, no explanation:
{
  "questions": [
    {"question": "short question max 10 words", "options": ["opt1","opt2","opt3","opt4"]},
    {"question": "...", "options": ["...","...","...","..."]},
    {"question": "...", "options": ["...","...","...","..."]},
    {"question": "...", "options": ["...","...","...","..."]}
  ],
  "task": {
    "title": "4-6 word title",
    "description": "Two sentence description.",
    "steps": ["step 1", "step 2", "step 3"],
    "priority": "Medium",
    "notes": "any extra context"
  }
}
Make options specific to a dental office. Cover: deadline, urgency, scope, notification.`;

    try {
      const raw = await callClaude(
        [{role:"user", content:`Task: "${rawTask}"\nEmployee: ${assignee.name}, ${assignee.title}${patientCtx?`\nPatient: ${patientCtx}`:""}`}],
        sys
      );
      // Aggressively strip markdown fences and find the JSON boundaries
      const stripped = raw.replace(/```json|```/gi,"").trim();
      const s = stripped.indexOf("{");
      const e = stripped.lastIndexOf("}");
      const jsonStr = (s>=0 && e>s) ? stripped.slice(s, e+1) : stripped;
      const parsed = JSON.parse(jsonStr);

      // Validate questions - never allow empty array through
      const qs = Array.isArray(parsed?.questions) && parsed.questions.length >= 3
        ? parsed.questions
        : FALLBACK_Q;

      setQuestions(qs);
      setTaskTpl(parsed?.task || null);
    } catch (err) {
      // Always fall through with fallback - user never sees a blank screen
      setQuestions(FALLBACK_Q);
      setTaskTpl(null);
    }
    setStep("survey");
  }

  function handleAnswer(question, answer) {
    const na={...answers,[question]:answer};
    setAnswers(na);
    if (qIndex+1<questions.length) { setQIndex(qIndex+1); return; }
    // Compile instantly — no second API call
    const vals=Object.values(na);
    const deadline=vals[0]||"As discussed";
    const priority=vals[1]?.includes("Urgent")?"Urgent":vals[1]?.includes("High")?"High":vals[1]?.includes("Low")?"Low":"Medium";
    const notifyNote=vals[3]||"";
    setFinalTask({
      title:      taskTemplate?.title||rawTask.slice(0,40),
      description:taskTemplate?.description||rawTask,
      steps:      normalizeSteps(taskTemplate?.steps||[]),
      deadline, priority,
      notes:[taskTemplate?.notes,notifyNote?`Notify: ${notifyNote}`:""].filter(Boolean).join(" · ")||"",
      patientContext: patientCtx,
    });
    setStep("preview");
  }

  async function confirmTask() {
    if (sending) return;
    setSending(true);
    const task = {
      id:uid(), title:finalTask.title, description:finalTask.description,
      steps:finalTask.steps, deadline:finalTask.deadline, priority:finalTask.priority,
      notes:finalTask.notes, patientContext:finalTask.patientContext||"",
      assigneeId:assignee.id, assigneeName:assignee.name,
      managerId:manager.id, managerName:manager.name,
      status:"open", createdAt:nowStr(), acknowledgedAt:null,
      recurringTemplateId:null, messages:[],
    };
    // Save recurring template if needed
    if (frequency!=="None") {
      const tmpl={...task,id:uid(),frequency:frequency.toLowerCase(),lastCreatedDate:today(),recurringTemplateId:undefined};
      const templates=await loadRecurring();
      await saveRecurring([...templates,tmpl]);
    }
    setStep("sent");
    setTimeout(()=>onTaskCreated(task),1800);
  }

  return (
    <div className="fade-up" style={{background:G.surface,borderRadius:22,padding:28,boxShadow:G.shadowMd,maxWidth:540,width:"100%",margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:23,color:G.navy,fontWeight:600}}>New Task</h2>
          <p style={{fontSize:12,color:G.sub,marginTop:3}}>
            {step==="form"&&"Fill in the basics"}{step==="loading"&&"Building questions…"}
            {step==="survey"&&`Clarifying for ${assignee?.name?.split(" ")[0]}`}
            {step==="preview"&&"Review before sending"}{step==="sent"&&"Task delivered!"}
          </p>
        </div>
        {step!=="sent"&&<button onClick={onCancel} style={{color:G.sub,fontSize:22,lineHeight:1,padding:"2px 8px"}}>✕</button>}
      </div>

      {/* FORM */}
      {step==="form"&&(
        <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:18}}>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:"1px"}}>Assign To</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
              {employees.map(emp=>(
                <button key={emp.id} onClick={()=>setAssignee(emp)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",borderRadius:11,border:`2px solid ${assignee?.id===emp.id?G.tealMid:G.border}`,background:assignee?.id===emp.id?G.tealLight:"transparent",transition:"all .15s"}}>
                  <Avatar user={emp} size={28}/>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:13,fontWeight:500,color:G.text}}>{emp.name.split(" ")[0]}</div>
                    <div style={{fontSize:10,color:G.sub}}>{emp.title}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:"1px"}}>Task Description</label>
            <textarea value={rawTask} onChange={e=>setRawTask(e.target.value)} placeholder={`e.g. "Prep room 2 for afternoon crown patients"`} rows={3}
              style={{marginTop:10,width:"100%",padding:"13px 15px",borderRadius:13,border:`2px solid ${G.border}`,fontSize:14,color:G.text,lineHeight:1.6,background:G.card,transition:"border .18s"}}
              onFocus={e=>e.target.style.borderColor=G.tealMid} onBlur={e=>e.target.style.borderColor=G.border}/>
          </div>

          {/* ── Patient Context (new) ── */}
          <div>
            <label style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:"1px"}}>Patient / Appointment <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:G.sub,fontSize:11}}>(optional)</span></label>
            <input value={patientCtx} onChange={e=>setPatientCtx(e.target.value)}
              placeholder="e.g. John Smith — 2:30 PM crown prep, chair 3"
              style={{marginTop:10,width:"100%",padding:"12px 15px",borderRadius:13,border:`2px solid ${G.border}`,fontSize:14,color:G.text,background:G.card,transition:"border .18s"}}
              onFocus={e=>e.target.style.borderColor=G.tealMid} onBlur={e=>e.target.style.borderColor=G.border}/>
          </div>

          {/* ── Recurring (new) ── */}
          <div>
            <label style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:"1px"}}>Repeat</label>
            <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
              {FREQ_OPTS.map(f=>(
                <button key={f} onClick={()=>setFrequency(f)} style={{padding:"8px 16px",borderRadius:20,fontSize:13,fontWeight:500,border:`2px solid ${frequency===f?G.tealMid:G.border}`,background:frequency===f?G.tealLight:"transparent",color:frequency===f?G.teal:G.sub,transition:"all .15s"}}>
                  {f}
                </button>
              ))}
            </div>
            {frequency!=="None"&&<p style={{fontSize:11,color:G.teal,marginTop:6}}>♻️ A new task will auto-create {frequency.toLowerCase()} for {assignee?.name?.split(" ")[0]||"this employee"}</p>}
          </div>

          <button onClick={startSurvey} disabled={!assignee||!rawTask.trim()} style={{padding:"14px",borderRadius:13,fontWeight:600,fontSize:14,transition:"all .2s",background:assignee&&rawTask.trim()?G.tealMid:G.border,color:assignee&&rawTask.trim()?"#fff":G.sub,boxShadow:assignee&&rawTask.trim()?"0 4px 16px rgba(31,144,128,.3)":"none",letterSpacing:".3px"}}>
            Start Clarification →
          </button>
        </div>
      )}

      {/* LOADING */}
      {step==="loading"&&(
        <div className="fade-in" style={{textAlign:"center",padding:"44px 20px"}}>
          <div style={{display:"inline-flex",width:54,height:54,borderRadius:"50%",background:G.tealLight,alignItems:"center",justifyContent:"center",marginBottom:18}}>
            <Spinner size={26}/>
          </div>
          <p style={{fontWeight:600,color:G.navy,fontSize:15}}>Building your questions…</p>
          <p style={{fontSize:13,color:G.sub,marginTop:6}}>One moment — answers will be instant after this</p>
        </div>
      )}

      {/* SURVEY */}
      {step==="survey"&&(
        <div>
          {/* Safety net: if questions still empty show spinner */}
          {questions.length===0&&(
            <div style={{textAlign:"center",padding:"44px 20px"}}>
              <div style={{display:"inline-flex",width:54,height:54,borderRadius:"50%",background:G.tealLight,alignItems:"center",justifyContent:"center",marginBottom:18}}><Spinner size={26}/></div>
              <p style={{fontWeight:600,color:G.navy,fontSize:15}}>Loading questions…</p>
            </div>
          )}
          {questions.length>0&&<div>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:G.tealLight,borderRadius:10,marginBottom:16,border:`1px solid ${G.border}`}}>
            <Avatar user={assignee} size={28}/>
            <span style={{fontSize:13,color:G.navy,fontWeight:500}}>{assignee.name}</span>
            <span style={{fontSize:12,color:G.sub}}>· {assignee.title}</span>
          </div>
          {patientCtx&&(
            <div style={{display:"flex",gap:8,alignItems:"center",padding:"8px 13px",background:"#f0eafa",borderRadius:10,marginBottom:14,border:"1px solid #d4befa"}}>
              <span style={{fontSize:13}}>🦷</span>
              <span style={{fontSize:12,color:"#4a2060",fontWeight:500}}>{patientCtx}</span>
            </div>
          )}
          <div style={{background:G.accentLight,borderRadius:10,padding:"10px 14px",marginBottom:22,borderLeft:`3px solid ${G.accent}`}}>
            <p style={{fontSize:11,color:"#8a5500",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:3}}>Task</p>
            <p style={{fontSize:13,color:G.text}}>{rawTask}</p>
          </div>
          <SurveyQuestion key={qIndex} question={questions[qIndex]} index={qIndex} total={questions.length} onAnswer={handleAnswer}/>
          </div>}
        </div>
      )}

      {/* PREVIEW */}
      {step==="preview"&&finalTask&&(
        <div className="fade-up">
          <div style={{display:"flex",gap:8,alignItems:"center",padding:"9px 13px",background:G.greenLight,borderRadius:10,marginBottom:18}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={G.green}/><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{fontSize:13,color:G.green,fontWeight:500}}>Task refined — ready to send</span>
          </div>
          <div style={{background:G.card,borderRadius:16,padding:18,border:`1.5px solid ${G.border}`,marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <h3 style={{fontSize:16,fontWeight:600,color:G.navy,flex:1,lineHeight:1.35}}>{finalTask.title}</h3>
              <PriTag priority={finalTask.priority}/>
            </div>
            {finalTask.patientContext&&(
              <div style={{display:"flex",gap:6,alignItems:"center",padding:"6px 10px",background:"#f0eafa",borderRadius:8,marginBottom:10,border:"1px solid #d4befa"}}>
                <span style={{fontSize:12}}>🦷</span>
                <span style={{fontSize:12,color:"#4a2060",fontWeight:500}}>{finalTask.patientContext}</span>
              </div>
            )}
            <p style={{fontSize:13,color:G.text,lineHeight:1.65,marginBottom:12}}>{finalTask.description}</p>
            {finalTask.steps?.length>0&&(
              <div style={{marginBottom:12}}>
                <p style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:".8px",marginBottom:7}}>Steps</p>
                {finalTask.steps.map((s,i)=>(
                  <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start",marginBottom:5}}>
                    <div style={{width:19,height:19,borderRadius:"50%",background:G.tealLight,color:G.teal,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
                    <span style={{fontSize:13,color:G.text,lineHeight:1.5}}>{s.text||s}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px 20px",paddingTop:10,borderTop:`1px solid ${G.border}`}}>
              <span style={{fontSize:12,color:G.sub}}>📅 {finalTask.deadline}</span>
              <span style={{fontSize:12,color:G.sub}}>👤 {assignee.name}</span>
              {frequency!=="None"&&<span style={{fontSize:12,color:G.teal}}>♻️ {frequency}</span>}
            </div>
            {finalTask.notes&&<p style={{marginTop:10,fontSize:12,color:G.sub,fontStyle:"italic",borderTop:`1px solid ${G.border}`,paddingTop:10}}>📌 {finalTask.notes}</p>}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setStep("survey");setQIndex(0);setAnswers({});}} style={{flex:1,padding:"13px",borderRadius:13,fontWeight:500,fontSize:13,border:`2px solid ${G.border}`,color:G.sub}}>← Redo</button>
            <button onClick={confirmTask} disabled={sending} style={{flex:2,padding:"13px",borderRadius:13,fontWeight:600,fontSize:14,background:sending?G.teal:G.tealMid,color:"#fff",boxShadow:"0 4px 16px rgba(31,144,128,.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:sending?.8:1}}>
              {sending?<><Spinner size={16} color="#fff"/> Sending…</>:`Send to ${assignee.name.split(" ")[0]} →`}
            </button>
          </div>
        </div>
      )}

      {/* SENT */}
      {step==="sent"&&(
        <div className="fade-up" style={{textAlign:"center",padding:"32px 16px 20px"}}>
          <div style={{display:"inline-flex",width:72,height:72,borderRadius:"50%",background:G.greenLight,alignItems:"center",justifyContent:"center",marginBottom:20}}>
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={G.green}/><path d="M7 12l4 4 6-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,color:G.navy,fontWeight:600,marginBottom:8}}>Task Sent!</h3>
          <p style={{fontSize:14,color:G.sub,marginBottom:6}}><strong style={{color:G.text}}>{finalTask?.title}</strong></p>
          <div style={{display:"inline-flex",alignItems:"center",gap:10,padding:"10px 16px",background:G.tealLight,borderRadius:50,marginBottom:20,border:`1px solid ${G.border}`}}>
            <Avatar user={assignee} size={28}/>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:13,fontWeight:600,color:G.navy}}>{assignee.name}</div>
              <div style={{fontSize:11,color:G.sub}}>{assignee.title}</div>
            </div>
          </div>
          <p style={{fontSize:12,color:G.sub}}>Returning to task list…</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CHECKLIST COMPONENT (inside task detail)
// ══════════════════════════════════════════════════════════════
function Checklist({ steps, onUpdate, readonly=false }) {
  if (!steps||steps.length===0) return null;
  const done  = steps.filter(s=>s.done).length;
  const pct   = Math.round((done/steps.length)*100);

  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:11,fontWeight:600,color:G.sub,textTransform:"uppercase",letterSpacing:".8px"}}>Checklist</p>
        <span style={{fontSize:11,color:done===steps.length?G.green:G.sub,fontWeight:600}}>{done}/{steps.length} done {done===steps.length&&"✓"}</span>
      </div>
      <div style={{height:4,background:G.border,borderRadius:4,overflow:"hidden",marginBottom:10}}>
        <div className="progress-fill" style={{height:"100%",width:`${pct}%`,background:done===steps.length?G.green:G.tealMid,borderRadius:4,transition:"width .3s"}}/>
      </div>
      {steps.map((s,i)=>(
        <div key={i} className={`check-item${s.done?" done-item":""}`}
          onClick={()=>{ if(readonly) return; const n=[...steps]; n[i]={...n[i],done:!n[i].done}; onUpdate(n); }}
          style={{cursor:readonly?"default":"pointer"}}>
          <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${s.done?G.tealMid:G.border}`,background:s.done?G.tealMid:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all .15s"}}>
            {s.done&&<svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <span style={{fontSize:13,color:s.done?G.sub:G.text,lineHeight:1.5,textDecoration:s.done?"line-through":"none"}}>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  TASK DETAIL
// ══════════════════════════════════════════════════════════════
function TaskDetail({ task, currentUser, onUpdate, onBack }) {
  const [msg, setMsg] = useState("");
  const bottomRef = useRef(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[task.messages]);

  const isEmployee = currentUser.role==="employee";
  const isManager  = currentUser.role==="manager";
  const needsAck   = isEmployee&&!task.acknowledgedAt;

  function sendMessage() {
    if (!msg.trim()) return;
    onUpdate({...task,messages:[...task.messages,{id:uid(),senderId:currentUser.id,senderName:currentUser.name,text:msg.trim(),at:nowStr(),type:"message"}]});
    setMsg("");
  }

  function acknowledge() {
    onUpdate({...task,acknowledgedAt:nowStr(),messages:[...task.messages,{id:uid(),senderId:currentUser.id,senderName:currentUser.name,text:"✅ Task acknowledged — I'm on it.",at:nowStr(),type:"message"}]});
  }

  function updateChecklist(newSteps) {
    const allDone = newSteps.every(s=>s.done);
    onUpdate({...task,steps:newSteps,status:allDone?"done":task.status==="open"?"inprogress":task.status});
  }

  const visibleMsgs = task.messages.filter(m=>m.type!=="system");
  const steps = normalizeSteps(task.steps);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${G.border}`,background:G.surface}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:5,color:G.sub,fontSize:13,marginBottom:12}}>
          <svg width="14" height="14" fill="none" stroke={G.sub} strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Back to tasks
        </button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <h2 style={{fontSize:17,fontWeight:600,color:G.navy,marginBottom:5}}>{task.title}</h2>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <StatusTag status={task.status}/>
              <PriTag priority={task.priority}/>
              <span style={{fontSize:12,color:G.sub}}>📅 {task.deadline}</span>
              {isManager&&<span style={{fontSize:12,color:G.sub}}>👤 {task.assigneeName}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["open","inprogress","done"].filter(s=>s!==task.status).map(s=>(
              <button key={s} onClick={()=>onUpdate({...task,status:s})} style={{padding:"5px 11px",borderRadius:8,fontSize:12,fontWeight:500,border:`1.5px solid ${G.border}`,color:G.sub,background:G.surface}}>
                {s==="inprogress"?"In Progress":s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Task card */}
        <div style={{marginTop:12,background:G.card,borderRadius:11,padding:14,border:`1px solid ${G.border}`}}>
          {task.patientContext&&(
            <div style={{display:"flex",gap:6,alignItems:"center",padding:"6px 10px",background:"#f0eafa",borderRadius:8,marginBottom:10,border:"1px solid #d4befa"}}>
              <span style={{fontSize:12}}>🦷</span>
              <span style={{fontSize:12,color:"#4a2060",fontWeight:500}}>{task.patientContext}</span>
            </div>
          )}
          <p style={{fontSize:13,color:G.text,lineHeight:1.65,marginBottom:steps.length?12:0}}>{task.description}</p>
          {/* ── Tappable Checklist ── */}
          <Checklist steps={steps} onUpdate={isEmployee?updateChecklist:undefined} readonly={isManager}/>
          {task.notes&&<p style={{fontSize:12,color:G.sub,borderTop:`1px solid ${G.border}`,paddingTop:8,fontStyle:"italic"}}>📌 {task.notes}</p>}
        </div>

        {/* ── Manager: Acknowledgment receipt ── */}
        {isManager&&task.acknowledgedAt&&(
          <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:G.greenLight,borderRadius:9,border:`1px solid #b8dfc8`}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={G.green}/><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{fontSize:12,color:G.green,fontWeight:500}}>Seen by {task.assigneeName} · {task.acknowledgedAt}</span>
          </div>
        )}
        {isManager&&!task.acknowledgedAt&&(
          <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"#fff8e3",borderRadius:9,border:`1px solid #f0d080`}}>
            <div className="pulse-dot" style={{width:8,height:8,borderRadius:"50%",background:G.accent,flexShrink:0}}/>
            <span style={{fontSize:12,color:"#7a5800"}}>Waiting for acknowledgment from {task.assigneeName}…</span>
          </div>
        )}
      </div>

      {/* ── Employee: Acknowledge banner ── */}
      {needsAck&&(
        <div style={{padding:"12px 20px",borderBottom:`1px solid ${G.border}`,background:"#fffdf5"}}>
          <div className="ack-banner">
            <div style={{flex:1}}>
              <p style={{fontSize:14,fontWeight:600,color:G.navy,marginBottom:2}}>New task assigned to you</p>
              <p style={{fontSize:12,color:G.sub}}>Tap to confirm you've seen it — Dr. Hart will be notified.</p>
            </div>
            <button onClick={acknowledge} style={{padding:"10px 18px",borderRadius:11,background:G.accent,color:"#fff",fontWeight:600,fontSize:13,flexShrink:0,boxShadow:"0 3px 12px rgba(232,160,37,.35)"}}>
              👁 Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
        {visibleMsgs.length===0&&<div style={{textAlign:"center",color:G.sub,fontSize:13,marginTop:24,opacity:.7}}>No messages yet — start the conversation!</div>}
        {visibleMsgs.map(m=>{
          const sender=STAFF.find(s=>s.id===m.senderId);
          const isMe=m.senderId===currentUser.id;
          return (
            <div key={m.id} className="fade-up" style={{display:"flex",gap:9,flexDirection:isMe?"row-reverse":"row",alignItems:"flex-start"}}>
              {sender&&<Avatar user={sender} size={30}/>}
              <div style={{maxWidth:"74%"}}>
                <div style={{display:"flex",gap:8,alignItems:"baseline",flexDirection:isMe?"row-reverse":"row",marginBottom:3}}>
                  <span style={{fontSize:12,fontWeight:600,color:G.navy}}>{isMe?"You":m.senderName}</span>
                  <span style={{fontSize:10,color:G.sub}}>{m.at}</span>
                </div>
                <div style={{padding:"10px 14px",fontSize:13,lineHeight:1.55,borderRadius:isMe?"14px 4px 14px 14px":"4px 14px 14px 14px",background:isMe?G.navy:G.surface,color:isMe?"#fff":G.text,border:!isMe?`1.5px solid ${G.border}`:"none",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{padding:"12px 20px",borderTop:`1px solid ${G.border}`,background:G.surface,display:"flex",gap:8}}>
        <textarea value={msg} onChange={e=>setMsg(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),sendMessage())}
          placeholder={isManager?"Send feedback or instructions…":"Send an update or question…"}
          rows={2} style={{flex:1,padding:"10px 14px",borderRadius:12,border:`2px solid ${G.border}`,fontSize:13,color:G.text,background:G.card,lineHeight:1.5,transition:"border .15s"}}
          onFocus={e=>e.target.style.borderColor=G.tealMid} onBlur={e=>e.target.style.borderColor=G.border}/>
        <button onClick={sendMessage} disabled={!msg.trim()} style={{width:44,borderRadius:12,flexShrink:0,background:msg.trim()?G.tealMid:G.border,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  TASK LIST
// ══════════════════════════════════════════════════════════════
function TaskList({ tasks, currentUser, onSelect }) {
  const mine = currentUser.role==="manager" ? tasks : tasks.filter(t=>t.assigneeId===currentUser.id);
  if (!mine.length) return (
    <div style={{textAlign:"center",padding:"52px 24px",color:G.sub}}>
      <div style={{fontSize:44,marginBottom:14}}>📋</div>
      <p style={{fontSize:15,fontWeight:500,color:G.navy}}>No tasks yet</p>
      <p style={{fontSize:13,marginTop:5}}>{currentUser.role==="manager"?"Create a new task to get started":"You're all caught up!"}</p>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,padding:"16px 20px"}}>
      {mine.map(task=>{
        const assignee=STAFF.find(s=>s.id===task.assigneeId);
        const visibleMsgs=task.messages.filter(m=>m.type!=="system");
        const hasUnread=visibleMsgs.length>0&&visibleMsgs[visibleMsgs.length-1].senderId!==currentUser.id;
        const steps=normalizeSteps(task.steps);
        const donePct=steps.length?Math.round(steps.filter(s=>s.done).length/steps.length*100):null;
        const needsAck=currentUser.role==="employee"&&!task.acknowledgedAt;
        const isManager=currentUser.role==="manager";

        return (
          <button key={task.id} onClick={()=>onSelect(task)}
            style={{display:"flex",gap:13,alignItems:"flex-start",padding:"14px 16px",background:G.surface,borderRadius:15,border:`2px solid ${hasUnread||needsAck?G.tealMid:G.border}`,textAlign:"left",transition:"all .18s",boxShadow:hasUnread?"0 2px 16px rgba(31,144,128,.12)":G.shadow}}
            onMouseOver={e=>e.currentTarget.style.boxShadow=G.shadowMd}
            onMouseOut={e=>e.currentTarget.style.boxShadow=hasUnread?"0 2px 16px rgba(31,144,128,.12)":G.shadow}>
            {assignee&&<Avatar user={assignee} size={40}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:3}}>
                <span style={{fontSize:14,fontWeight:hasUnread||needsAck?600:500,color:G.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</span>
                <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                  {(hasUnread||needsAck)&&<div style={{width:8,height:8,borderRadius:"50%",background:G.tealBright}}/>}
                  <StatusTag status={task.status}/>
                  <PriTag priority={task.priority}/>
                </div>
              </div>
              {task.patientContext&&<p style={{fontSize:11,color:"#4a2060",marginBottom:3,fontWeight:500}}>🦷 {task.patientContext}</p>}
              <p style={{fontSize:12,color:G.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5}}>{task.description}</p>

              {/* Checklist mini-bar */}
              {donePct!==null&&steps.length>0&&(
                <div style={{marginBottom:5}}>
                  <div style={{height:3,background:G.border,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${donePct}%`,background:donePct===100?G.green:G.tealMid,borderRadius:3,transition:"width .3s"}}/>
                  </div>
                  <span style={{fontSize:10,color:donePct===100?G.green:G.sub,marginTop:2,display:"block"}}>{steps.filter(s=>s.done).length}/{steps.length} steps done</span>
                </div>
              )}

              <div style={{display:"flex",gap:12}}>
                <span style={{fontSize:11,color:G.sub}}>📅 {task.deadline}</span>
                {isManager&&<span style={{fontSize:11,color:G.sub}}>👤 {task.assigneeName}</span>}
                {isManager&&(task.acknowledgedAt
                  ? <span style={{fontSize:11,color:G.green}}>✓ Seen</span>
                  : <span style={{fontSize:11,color:G.accent}}>⏳ Not seen</span>)}
                {task.recurringTemplateId&&<span style={{fontSize:11,color:G.teal}}>♻️ Recurring</span>}
                <span style={{fontSize:11,color:G.sub}}>💬 {visibleMsgs.length}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  RECURRING MANAGER TAB
// ══════════════════════════════════════════════════════════════
function RecurringManager() {
  const [templates, setTemplates] = useState([]);
  useEffect(()=>{ loadRecurring().then(setTemplates); },[]);

  async function deleteTemplate(id) {
    const updated=templates.filter(t=>t.id!==id);
    setTemplates(updated); await saveRecurring(updated);
  }

  if (!templates.length) return (
    <div style={{textAlign:"center",padding:"52px 24px",color:G.sub}}>
      <div style={{fontSize:44,marginBottom:14}}>♻️</div>
      <p style={{fontSize:15,fontWeight:500,color:G.navy}}>No recurring tasks yet</p>
      <p style={{fontSize:13,marginTop:5}}>When you create a task with a repeat schedule,<br/>it will appear here.</p>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,padding:"16px 20px"}}>
      {templates.map(tmpl=>{
        const assignee=STAFF.find(s=>s.id===tmpl.assigneeId);
        return (
          <div key={tmpl.id} style={{display:"flex",gap:13,alignItems:"center",padding:"14px 16px",background:G.surface,borderRadius:15,border:`1.5px solid ${G.border}`,boxShadow:G.shadow}}>
            {assignee&&<Avatar user={assignee} size={38}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{fontSize:14,fontWeight:500,color:G.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tmpl.title}</span>
                <span style={{fontSize:11,color:G.teal,background:G.tealLight,padding:"2px 8px",borderRadius:20,fontWeight:600,flexShrink:0}}>♻️ {tmpl.frequency?.charAt(0).toUpperCase()+tmpl.frequency?.slice(1)}</span>
                <PriTag priority={tmpl.priority}/>
              </div>
              <p style={{fontSize:12,color:G.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{tmpl.description}</p>
              <span style={{fontSize:11,color:G.sub}}>→ {tmpl.assigneeName} · Last created: {tmpl.lastCreatedDate||"Never"}</span>
            </div>
            <button onClick={()=>deleteTemplate(tmpl.id)} style={{color:G.red,fontSize:18,padding:"4px 8px",flexShrink:0,opacity:.7}}>🗑</button>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]               = useState(null);
  const [tasks, setTasks]             = useState([]);
  const [view, setView]               = useState("tasks");
  const [tab, setTab]                 = useState("active");  // active | recurring
  const [selectedTask, setSelectedTask] = useState(null);
  const [notifGranted, setNotifGranted] = useState(false);
  const tasksRef = useRef(tasks); tasksRef.current = tasks;

  // Load tasks + set up Supabase real-time subscription
  useEffect(()=>{
    if (!user) return;
    (async ()=>{
      let t = await loadTasks();
      t = await processRecurring(t);
      setTasks(t);
    })();
    requestNotifPerm().then(setNotifGranted);

    // Real-time: any change to dental_tasks triggers an instant refresh
    const channel = supabase
      .channel("dental_tasks_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "dental_tasks" },
        async (payload) => {
          const latest = await loadTasks();
          const current = tasksRef.current;

          // Fire notifications for new tasks / messages / acknowledgments
          if (user.role==="employee") {
            latest.forEach(t=>{
              if(t.assigneeId!==user.id) return;
              const prev=current.find(p=>p.id===t.id);
              if(!prev) fireNotif("New Task Assigned 🦷", t.title);
              else if(t.messages.length>prev.messages.length){
                const last=t.messages[t.messages.length-1];
                if(last.senderId!==user.id) fireNotif(last.senderName, last.text.slice(0,80));
              }
            });
          }
          if (user.role==="manager") {
            latest.forEach(t=>{
              const prev=current.find(p=>p.id===t.id);
              if(!prev) return;
              if(!prev.acknowledgedAt&&t.acknowledgedAt) fireNotif(`${t.assigneeName} acknowledged task`, t.title);
              if(t.messages.length>prev.messages.length){
                const last=t.messages[t.messages.length-1];
                if(last.senderId!==user.id) fireNotif(`Reply from ${last.senderName}`, last.text.slice(0,80));
              }
            });
          }
          setTasks(latest);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },[user]);

  // Real-time updates handled by Supabase subscription above



  async function handleTaskCreated(task) {
    const updated=[...tasks,task];
    setTasks(updated); await saveOneTask(task);  // Supabase: just upsert the new task
    fireNotif("Task Sent ✓", `${task.title} → ${task.assigneeName}`);
    // SMS the assignee
    const assignee = STAFF.find(s=>s.id===task.assigneeId);
    if (assignee?.phone) {
      sendSMS(assignee.phone,
        `New task from ${task.managerName}: "${task.title}"` +
        `\nDue: ${task.deadline}` +
        (task.patientContext ? `\nPatient: ${task.patientContext}` : "") +
        `\nReply in the Hart Dental app.`
      );
    }
    setView("tasks");
  }

  async function handleTaskUpdate(updatedTask) {
    const prev = tasks.find(t=>t.id===updatedTask.id);
    const updated=tasks.map(t=>t.id===updatedTask.id?updatedTask:t);
    setTasks(updated); setSelectedTask(updatedTask); await saveOneTask(updatedTask);  // Supabase: upsert changed task only

    // SMS: new message sent
    const prevMsgs = prev?.messages.filter(m=>m.type!=="system")||[];
    const newMsgs  = updatedTask.messages.filter(m=>m.type!=="system");
    if (newMsgs.length > prevMsgs.length) {
      const lastMsg = newMsgs[newMsgs.length-1];
      // SMS the OTHER party (not the sender)
      const recipientId = lastMsg.senderId===updatedTask.managerId
        ? updatedTask.assigneeId
        : updatedTask.managerId;
      const recipient = STAFF.find(s=>s.id===recipientId);
      if (recipient?.phone) {
        sendSMS(recipient.phone,
          `${lastMsg.senderName} on "${updatedTask.title}":\n"${lastMsg.text.slice(0,120)}"`
        );
      }
    }

    // SMS: employee acknowledged — notify manager
    if (!prev?.acknowledgedAt && updatedTask.acknowledgedAt) {
      const mgr = STAFF.find(s=>s.id===updatedTask.managerId);
      if (mgr?.phone) {
        sendSMS(mgr.phone,
          `✅ ${updatedTask.assigneeName} acknowledged: "${updatedTask.title}"`
        );
      }
    }

    // SMS: status changed to done — notify manager
    if (prev?.status!=="done" && updatedTask.status==="done") {
      const mgr = STAFF.find(s=>s.id===updatedTask.managerId);
      if (mgr?.phone) {
        sendSMS(mgr.phone,
          `✓ Task complete: "${updatedTask.title}" — marked done by ${updatedTask.assigneeName}`
        );
      }
    }
  }

  if (!user) return <><style>{css}</style><LoginScreen onLogin={setUser}/></>;

  const mine      = user.role==="manager" ? tasks : tasks.filter(t=>t.assigneeId===user.id);
  const openCount = mine.filter(t=>t.status!=="done").length;
  const unackCount= user.role==="employee" ? mine.filter(t=>!t.acknowledgedAt&&t.status!=="done").length : 0;
  const newMsgCount = mine.filter(t=>{ const v=t.messages.filter(m=>m.type!=="system"); return v.length>0&&v[v.length-1].senderId!==user.id; }).length;
  const totalBadge = openCount + unackCount + newMsgCount > 0;

  return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:G.bg,display:"flex",flexDirection:"column"}}>

        {/* Nav */}
        <div style={{background:G.navy,height:56,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:9,background:G.tealMid,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 2.3 1.1 4.4 2.8 5.7V19a.5.5 0 00.5.5h.5V21h6v-1.5h.5a.5.5 0 00.5-.5v-4.8c1.7-1.3 2.8-3.4 2.8-5.7C19.1 5 16.1 2 12 2z"/></svg>
            </div>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:"#fff",fontWeight:600}}>Hart Dental</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {!notifGranted&&(
              <button onClick={()=>requestNotifPerm().then(setNotifGranted)} style={{fontSize:11,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.07)",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(255,255,255,.12)"}}>
                🔔 Enable notifications
              </button>
            )}
            {/* SMS status badge */}
            {SMS_SERVER.includes("YOUR_REPLIT") ? (
              <div style={{fontSize:11,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.05)",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(255,255,255,.08)"}}>
                📵 SMS not set up
              </div>
            ) : (
              <div style={{fontSize:11,color:"rgba(100,255,200,.7)",background:"rgba(100,255,200,.07)",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(100,255,200,.15)"}}>
                📲 SMS active
              </div>
            )}
            {totalBadge&&(
              <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.07)",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(255,255,255,.1)"}}>
                <div className="pulse-dot" style={{width:7,height:7,borderRadius:"50%",background:G.tealBright}}/>
                <span style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>{openCount} open</span>
              </div>
            )}
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <Avatar user={user} size={32}/>
              <div>
                <div style={{fontSize:13,color:"#fff",fontWeight:500}}>{user.name.split(" ")[0]}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.38)",textTransform:"uppercase",letterSpacing:".6px"}}>{user.role==="manager"?"Manager":user.title}</div>
              </div>
            </div>
            <button onClick={()=>{setUser(null);setView("tasks");setSelectedTask(null);}} style={{color:"rgba(255,255,255,.3)",fontSize:12,padding:"4px 8px"}}>Sign out</button>
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,maxWidth:700,width:"100%",margin:"0 auto",padding:"22px 16px"}}>

          {/* TASKS VIEW */}
          {view==="tasks"&&(
            <div className="fade-up">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
                <div>
                  <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,color:G.navy,fontWeight:600}}>{user.role==="manager"?"All Tasks":"My Tasks"}</h1>
                  <p style={{fontSize:13,color:G.sub,marginTop:2}}>{mine.length} task{mine.length!==1?"s":""}  {openCount>0?`, ${openCount} open`:"— all done!"}</p>
                </div>
                {user.role==="manager"&&(
                  <button onClick={()=>setView("newTask")} style={{display:"flex",alignItems:"center",gap:7,padding:"10px 18px",borderRadius:12,background:G.tealMid,color:"#fff",fontWeight:600,fontSize:13,boxShadow:"0 4px 16px rgba(31,144,128,.3)"}}>
                    <svg width="15" height="15" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>New Task
                  </button>
                )}
              </div>

              {/* Manager tabs */}
              {user.role==="manager"&&(
                <div style={{display:"flex",gap:6,marginBottom:16,background:G.surface,padding:4,borderRadius:24,width:"fit-content",border:`1px solid ${G.border}`}}>
                  <button className={`tab-btn${tab==="active"?" active":""}`} onClick={()=>setTab("active")}>Active Tasks</button>
                  <button className={`tab-btn${tab==="recurring"?" active":""}`} onClick={()=>setTab("recurring")}>♻️ Recurring</button>
                </div>
              )}

              <div style={{background:G.surface,borderRadius:18,border:`1.5px solid ${G.border}`,overflow:"hidden",boxShadow:G.shadow}}>
                {tab==="active"||user.role==="employee"
                  ? <TaskList tasks={tasks} currentUser={user} onSelect={t=>{setSelectedTask(t);setView("taskDetail");}}/>
                  : <RecurringManager/>}
              </div>
            </div>
          )}

          {view==="newTask"&&(
            <NewTaskWizard manager={user} onTaskCreated={handleTaskCreated} onCancel={()=>setView("tasks")}/>
          )}

          {view==="taskDetail"&&selectedTask&&(
            <div className="fade-up" style={{background:G.surface,borderRadius:18,border:`1.5px solid ${G.border}`,overflow:"hidden",boxShadow:G.shadow,display:"flex",flexDirection:"column",height:"calc(100vh - 96px)"}}>
              <TaskDetail task={selectedTask} currentUser={user} onUpdate={handleTaskUpdate} onBack={()=>{setView("tasks");setSelectedTask(null);}}/>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
