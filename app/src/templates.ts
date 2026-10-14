// Simple mode: when no AI is configured, Reboot builds a ready-made template
// app instead. The request is matched to the closest template, which gets a
// name and an accent color. Each template is a small app that works, with its
// data kept in localStorage.

export type Kind =
  | "kanban" | "todo" | "notes" | "chat" | "music" | "canvas"
  | "form" | "table" | "cards" | "timer" | "landing";

const RULES: [Kind, RegExp][] = [
  ["todo", /to-?do|todoist|\btasks?\b|habit|checklist|reminder|\bthings\b/i],
  ["kanban", /kanban|trello|linear|issue|\bboards?\b|jira|sprint|project manag/i],
  ["canvas", /figma|design tool|draw|paint|whiteboard|miro|canvas|sketch|photo/i],
  ["table", /airtable|spreadsheet|database|\btable\b|crm|inventory|budget|expense/i],
  ["form", /\bforms?\b|typeform|survey|poll/i],
  ["notes", /\bnotes?\b|notion|obsidian|\bdocs?\b|journal|wiki|writing/i],
  ["chat", /chat|discord|slack|messag|channel|forum/i],
  ["music", /music|spotify|player|playlist|song|podcast/i],
  ["cards", /duolingo|language|flash ?card|learn|study|quiz|vocab/i],
  ["timer", /headspace|meditat|breath|pomodoro|timer|focus|calm|sleep/i],
];

const NAMES: Record<Kind, string[]> = {
  kanban: ["Boardly", "Stackr", "Cardbox", "Lanes"],
  todo: ["Tickd", "Donezo", "Listful", "Checkr"],
  notes: ["Jotter", "Pagely", "Inkwell", "Notecraft"],
  chat: ["Hangout", "Chatterbox", "Huddle", "Ripple"],
  music: ["Tempo", "Loopy", "Waveform", "Groove"],
  canvas: ["Sketchpad", "Drawly", "Canvasly", "Doodle"],
  form: ["Askly", "Formful", "Pollster", "Quizly"],
  table: ["Gridly", "Tabletop", "Rowbase", "Cellar"],
  cards: ["Flashy", "Lingo Loop", "Recall", "Studybug"],
  timer: ["Stillness", "Breathe", "Focusly", "Pause"],
  landing: ["Northwind", "Brightside", "Launchpad", "Evergreen"],
};

const ACCENTS = ["#16A34A", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#0891B2", "#CA8A04"];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function kindFor(text: string, isSite = false): Kind {
  if (isSite) return "landing";
  // Match on what the app is ("A design tool like Figma: ..."), not its feature list.
  const head = text.split(/[:.\n]/)[0].slice(0, 160);
  for (const part of [head, text]) for (const [kind, re] of RULES) if (re.test(part)) return kind;
  return "todo";
}

export function describe(kind: Kind, name: string): string {
  const what: Record<Kind, string> = {
    kanban: "a kanban board with lists you can add cards to and move between",
    todo: "a to-do list with adding, checking off, filtering and clearing tasks",
    notes: "a notes app with a page list, editing and search",
    chat: "a chat app with channels and a message composer",
    music: "a music player with a playlist and playback controls",
    canvas: "a drawing canvas with colors, brush sizes, undo and PNG export",
    form: "a form with a few questions and a thank-you screen",
    table: "a table you can add, edit and delete rows in",
    cards: "flashcards with flip, next and a score",
    timer: "a focus and breathing timer with presets",
    landing: "a landing page with a hero, features, pricing and a contact form",
  };
  return `WHAT IT IS - ${name}: ${what[kind]}.\nSIMPLE MODE - built from a ready-made template, no AI needed.`;
}

// ---- shared shell -------------------------------------------------------------

function shell(title: string, accent: string, body: string, css: string, js: string, dark = false) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--accent:${accent};--bg:#F7F8F7;--card:#fff;--ink:#14181A;--mute:#6B7280;--line:#E5E7EB;--r:12px;color-scheme:light}
${dark ? ":root" : "@media (prefers-color-scheme:dark){:root"}{--bg:#0F1113;--card:#181B1E;--ink:#F3F4F6;--mute:#9CA3AF;--line:#2A2E33;color-scheme:dark}${dark ? "" : "}"}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 Geist,system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header .logo{width:30px;height:30px;border-radius:9px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:600}
header h1{font-size:17px;margin:0;font-weight:600}
main{max-width:1000px;margin:0 auto;padding:20px}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:8px 12px}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
input,textarea,select{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:9px 11px;width:100%}
input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r)}
.muted{color:var(--mute)}
${css}
</style></head><body>
<header><span class="logo">${esc(title[0] ?? "A")}</span><h1>${esc(title)}</h1></header>
${body}
<script>
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const $=(s,r=document)=>r.querySelector(s);const esc=s=>String(s).replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
${js}
</script></body></html>`;
}

// ---- templates ------------------------------------------------------------------

const T: Record<Kind, (name: string) => { body: string; css: string; js: string }> = {
  todo: () => ({
    body: `<main><form id="f" class="row"><input id="t" placeholder="Add a task and press Enter"><button class="primary">Add</button></form>
<div class="filters"><button data-f="all" class="on">All</button><button data-f="open">Open</button><button data-f="done">Done</button><span class="muted" id="count"></span></div>
<ul id="list" class="card"></ul><button id="clear">Clear done</button></main>`,
    css: `.row{display:flex;gap:8px}.filters{display:flex;gap:6px;align-items:center;margin:14px 0}.filters .on{border-color:var(--accent);color:var(--accent)}#count{margin-left:auto}
#list{list-style:none;margin:0 0 12px;padding:0}#list li{display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}#list li:last-child{border:0}
#list li.done span{text-decoration:line-through;color:var(--mute)}#list li button{margin-left:auto;border:0;background:none;color:var(--mute)}#list input{width:18px;height:18px;accent-color:var(--accent)}`,
    js: `let items=store.get("tasks",[{t:"Plan the week",d:false},{t:"Reply to emails",d:true},{t:"Go for a run",d:false}]),f="all";
function draw(){const v=items.filter(i=>f=="all"||(f=="done")==i.d);$("#list").innerHTML=v.map((i)=>'<li class="'+(i.d?"done":"")+'"><input type="checkbox" '+(i.d?"checked":"")+' data-i="'+items.indexOf(i)+'"><span>'+esc(i.t)+'</span><button data-x="'+items.indexOf(i)+'" aria-label="Delete">✕</button></li>').join("")||'<li class="muted">Nothing here yet.</li>';$("#count").textContent=items.filter(i=>!i.d).length+" open";store.set("tasks",items)}
$("#f").onsubmit=e=>{e.preventDefault();const t=$("#t").value.trim();if(t){items.unshift({t,d:false});$("#t").value="";draw()}};
$("#list").onclick=e=>{const x=e.target.dataset;if(x.i!=null){items[x.i].d=!items[x.i].d;draw()}if(x.x!=null){items.splice(x.x,1);draw()}};
document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{f=b.dataset.f;document.querySelectorAll("[data-f]").forEach(x=>x.classList.toggle("on",x==b));draw()});
$("#clear").onclick=()=>{items=items.filter(i=>!i.d);draw()};draw();`,
  }),
  kanban: () => ({
    body: `<main><div id="board"></div></main>`,
    css: `#board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:700px){#board{grid-template-columns:1fr}}
.col{padding:12px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);min-height:200px}.col h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:0 0 10px}
.it{background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:10px;margin-bottom:8px;cursor:grab}.it .acts{display:flex;gap:4px;margin-top:6px}.it .acts button{padding:2px 8px;font-size:12px}
.col form{display:flex;gap:6px}.col.over{outline:2px dashed var(--accent)}`,
    js: `const cols=["To do","Doing","Done"];let cards=store.get("cards",[{t:"Sketch the landing page",c:0},{t:"Set up the database",c:1},{t:"Pick a name",c:2}]);
function draw(){$("#board").innerHTML=cols.map((n,ci)=>'<section class="col" data-c="'+ci+'"><h2>'+n+'</h2>'+cards.map((k,i)=>k.c==ci?'<div class="it" draggable="true" data-i="'+i+'">'+esc(k.t)+'<div class="acts">'+(ci>0?'<button data-m="-1" data-i="'+i+'">←</button>':'')+(ci<2?'<button data-m="1" data-i="'+i+'">→</button>':'')+'<button data-x="'+i+'">✕</button></div></div>':'').join("")+'<form data-c="'+ci+'"><input placeholder="Add a card"><button class="primary">+</button></form></section>').join("");store.set("cards",cards)}
$("#board").onclick=e=>{const d=e.target.dataset;if(d.m){cards[d.i].c+=+d.m;draw()}if(d.x){cards.splice(d.x,1);draw()}};
$("#board").onsubmit=e=>{e.preventDefault();const v=e.target.querySelector("input").value.trim();if(v){cards.push({t:v,c:+e.target.dataset.c});draw()}};
let drag=null;$("#board").ondragstart=e=>{drag=e.target.dataset.i};$("#board").ondragover=e=>{const c=e.target.closest(".col");if(c){e.preventDefault()}};
$("#board").ondrop=e=>{const c=e.target.closest(".col");if(c&&drag!=null){cards[drag].c=+c.dataset.c;drag=null;draw()}};draw();`,
  }),
  notes: () => ({
    body: `<main class="wrap"><aside class="card"><input id="q" placeholder="Search notes"><button class="primary" id="new">New note</button><ul id="pages"></ul></aside>
<section class="card ed"><input id="title" class="title"><textarea id="body" placeholder="Start writing…"></textarea><p class="muted" id="saved"></p></section></main>`,
    css: `.wrap{display:grid;grid-template-columns:240px 1fr;gap:14px;max-width:1100px}@media(max-width:700px){.wrap{grid-template-columns:1fr}}
aside{padding:12px;display:flex;flex-direction:column;gap:8px}#pages{list-style:none;margin:0;padding:0}#pages li{padding:8px 10px;border-radius:8px;cursor:pointer}#pages li.on{background:var(--accent);color:#fff}
.ed{padding:18px;display:flex;flex-direction:column;gap:10px}.title{font-size:22px;font-weight:600;border:0;padding:4px 0}textarea{min-height:50vh;border:0;resize:vertical;padding:4px 0}`,
    js: `let notes=store.get("notes",[{t:"Welcome",b:"This is your notes app. Click New note to start."},{t:"Ideas",b:"- A weekend project\\n- Learn to cook risotto"}]),cur=0;
function list(){const q=$("#q").value.toLowerCase();$("#pages").innerHTML=notes.map((n,i)=>(n.t+n.b).toLowerCase().includes(q)?'<li data-i="'+i+'" class="'+(i==cur?"on":"")+'">'+esc(n.t||"Untitled")+'</li>':'').join("")}
function open(i){cur=i;$("#title").value=notes[i].t;$("#body").value=notes[i].b;list()}
function save(){notes[cur]={t:$("#title").value,b:$("#body").value};store.set("notes",notes);$("#saved").textContent="Saved";list()}
$("#title").oninput=save;$("#body").oninput=save;$("#q").oninput=list;$("#pages").onclick=e=>{if(e.target.dataset.i)open(+e.target.dataset.i)};
$("#new").onclick=()=>{notes.unshift({t:"Untitled",b:""});open(0);store.set("notes",notes);$("#title").select()};open(0);`,
  }),
  chat: () => ({
    body: `<main class="wrap"><aside class="card"><b>Channels</b><ul id="ch"></ul></aside><section class="card room"><div id="msgs"></div><form id="f"><input id="m" placeholder="Message"><button class="primary">Send</button></form></section></main>`,
    css: `.wrap{display:grid;grid-template-columns:200px 1fr;gap:14px;height:calc(100vh - 100px)}@media(max-width:700px){.wrap{grid-template-columns:1fr}}
aside{padding:14px}#ch{list-style:none;padding:0;margin:8px 0 0}#ch li{padding:7px 9px;border-radius:8px;cursor:pointer;color:var(--mute)}#ch li.on{background:var(--accent);color:#fff}
.room{display:flex;flex-direction:column;min-height:0}#msgs{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg{display:flex;gap:10px}.av{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;font-weight:600}.msg b{font-size:14px}.msg small{color:var(--mute);margin-left:6px}
#f{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line)}`,
    js: `const people={Maya:"#16A34A",Theo:"#2563EB",Ari:"#DB2777",You:"var(--accent)"};let data=store.get("chat",{general:[{u:"Maya",t:"Morning everyone 👋"},{u:"Theo",t:"Coffee first, then code."}],ideas:[{u:"Ari",t:"What if the app had a dark mode?"}],random:[]}),cur="general";
function draw(){$("#ch").innerHTML=Object.keys(data).map(c=>'<li data-c="'+c+'" class="'+(c==cur?"on":"")+'"># '+c+'</li>').join("");$("#msgs").innerHTML=data[cur].map(m=>'<div class="msg"><span class="av" style="background:'+(people[m.u]||"#888")+'">'+m.u[0]+'</span><div><b>'+m.u+'</b><small>'+(m.at||"")+'</small><div>'+esc(m.t)+'</div></div></div>').join("")||'<p class="muted">No messages yet. Say hi!</p>';$("#msgs").scrollTop=1e9;store.set("chat",data)}
$("#ch").onclick=e=>{if(e.target.dataset.c){cur=e.target.dataset.c;draw()}};
$("#f").onsubmit=e=>{e.preventDefault();const t=$("#m").value.trim();if(!t)return;data[cur].push({u:"You",t,at:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});$("#m").value="";draw();setTimeout(()=>{data[cur].push({u:"Maya",t:"Nice, love that 🙌"});draw()},1200)};draw();`,
  }),
  music: () => ({
    body: `<main><section class="card now"><div class="art"></div><div><p class="muted">Now playing</p><h2 id="tt">—</h2><div class="bar"><i id="pr"></i></div><div class="ctl"><button id="prev">⏮</button><button class="primary" id="play">▶</button><button id="next">⏭</button></div></div></section><ul id="pl" class="card"></ul></main>`,
    css: `.now{display:flex;gap:20px;padding:20px;align-items:center;margin-bottom:14px}.art{width:140px;height:140px;border-radius:14px;flex:none;background:conic-gradient(from 200deg,var(--accent),#fff3,var(--accent))}
h2{margin:2px 0 12px}.bar{height:6px;background:var(--line);border-radius:4px;overflow:hidden;margin-bottom:12px}#pr{display:block;height:100%;width:0;background:var(--accent)}.ctl{display:flex;gap:8px}
#pl{list-style:none;padding:0;margin:0}#pl li{display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);cursor:pointer}#pl li.on{color:var(--accent);font-weight:600}`,
    js: `const songs=[["Morning Run",262],["Low Light",330],["Glasshouse",294],["Second Wind",349]];let i=0,on=false,t=0,ctx,osc;
function tone(){try{ctx=ctx||new AudioContext();osc&&osc.stop();osc=ctx.createOscillator();const g=ctx.createGain();g.gain.value=.04;osc.frequency.value=songs[i][1];osc.connect(g).connect(ctx.destination);osc.start()}catch{}}
function draw(){$("#tt").textContent=songs[i][0];$("#play").textContent=on?"⏸":"▶";$("#pl").innerHTML=songs.map((s,k)=>'<li data-k="'+k+'" class="'+(k==i?"on":"")+'"><span>'+s[0]+'</span><span class="muted">0:'+(20+k*7)+'</span></li>').join("")}
$("#play").onclick=()=>{on=!on;on?tone():osc&&osc.stop();draw()};$("#next").onclick=()=>{i=(i+1)%songs.length;t=0;on&&tone();draw()};$("#prev").onclick=()=>{i=(i+songs.length-1)%songs.length;t=0;on&&tone();draw()};
$("#pl").onclick=e=>{const li=e.target.closest("li");if(li){i=+li.dataset.k;t=0;on=true;tone();draw()}};setInterval(()=>{if(on){t=(t+1)%100;$("#pr").style.width=t+"%"}},300);draw();`,
  }),
  canvas: () => ({
    body: `<main><div class="tools card"><input type="color" id="col" value="#16a34a"><input type="range" id="size" min="2" max="40" value="6"><button id="undo">Undo</button><button id="clear">Clear</button><button class="primary" id="save">Export PNG</button></div><canvas id="c" class="card"></canvas></main>`,
    css: `.tools{display:flex;gap:8px;align-items:center;padding:10px;margin-bottom:12px;flex-wrap:wrap}.tools input[type=color]{width:44px;padding:2px;height:38px}.tools input[type=range]{width:140px}
canvas{width:100%;height:65vh;display:block;background:#fff;touch-action:none;cursor:crosshair}`,
    js: `const c=$("#c"),g=c.getContext("2d");let strokes=store.get("strokes",[]),cur=null;
function fit(){const r=c.getBoundingClientRect();c.width=r.width*devicePixelRatio;c.height=r.height*devicePixelRatio;g.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);paint()}
function paint(){g.clearRect(0,0,c.width,c.height);g.lineCap=g.lineJoin="round";for(const s of strokes){g.strokeStyle=s.c;g.lineWidth=s.w;g.beginPath();s.p.forEach(([x,y],k)=>k?g.lineTo(x,y):g.moveTo(x,y));g.stroke()}}
const pos=e=>{const r=c.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
c.onpointerdown=e=>{cur={c:$("#col").value,w:+$("#size").value,p:[pos(e)]};strokes.push(cur);c.setPointerCapture(e.pointerId)};c.onpointermove=e=>{if(cur){cur.p.push(pos(e));paint()}};c.onpointerup=()=>{cur=null;store.set("strokes",strokes)};
$("#undo").onclick=()=>{strokes.pop();paint();store.set("strokes",strokes)};$("#clear").onclick=()=>{strokes=[];paint();store.set("strokes",strokes)};
$("#save").onclick=()=>{const a=document.createElement("a");a.download="drawing.png";a.href=c.toDataURL();a.click()};addEventListener("resize",fit);fit();`,
  }),
  form: () => ({
    body: `<main><form id="f" class="card"><h2>Tell us about you</h2><label>Your name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
<label>How did you hear about us?<select name="src"><option>Friend</option><option>Social media</option><option>Search</option></select></label><label>Rate us<input name="rate" type="range" min="1" max="5" value="4"></label>
<label>Anything else?<textarea name="msg" rows="3"></textarea></label><button class="primary">Submit</button></form><div id="done" class="card" hidden><h2>Thanks! 🎉</h2><p class="muted">Your answer was saved.</p><p id="n" class="muted"></p><button id="again">Answer again</button></div></main>`,
    css: `form,#done{max-width:520px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:14px}label{display:flex;flex-direction:column;gap:6px;font-weight:500}h2{margin:0}input[type=range]{accent-color:var(--accent)}`,
    js: `let res=store.get("responses",[]);$("#f").onsubmit=e=>{e.preventDefault();res.push(Object.fromEntries(new FormData(e.target)));store.set("responses",res);$("#f").hidden=true;$("#done").hidden=false;$("#n").textContent=res.length+" responses so far"};
$("#again").onclick=()=>{$("#f").reset();$("#f").hidden=false;$("#done").hidden=true};`,
  }),
  table: () => ({
    body: `<main><div class="top"><input id="q" placeholder="Search"><button class="primary" id="add">Add row</button></div><div class="card wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Amount</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><p class="muted" id="sum"></p></main>`,
    css: `.top{display:flex;gap:8px;margin-bottom:12px}.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute)}
td input,td select{border:0;padding:4px;background:transparent}td button{border:0;background:none;color:var(--mute)}`,
    js: `let rows=store.get("rows",[{n:"Website redesign",s:"In progress",a:1200},{n:"Logo",s:"Done",a:400},{n:"Ad campaign",s:"Planned",a:900}]);const st=["Planned","In progress","Done"];
function draw(){const q=$("#q").value.toLowerCase();$("#rows").innerHTML=rows.map((r,i)=>r.n.toLowerCase().includes(q)?'<tr><td><input data-i="'+i+'" data-k="n" value="'+esc(r.n)+'"></td><td><select data-i="'+i+'" data-k="s">'+st.map(s=>'<option'+(s==r.s?" selected":"")+'>'+s+'</option>').join("")+'</select></td><td><input data-i="'+i+'" data-k="a" type="number" value="'+r.a+'"></td><td><button data-x="'+i+'">✕</button></td></tr>':'').join("");$("#sum").textContent=rows.length+" rows · total "+rows.reduce((t,r)=>t+(+r.a||0),0).toLocaleString();store.set("rows",rows)}
$("#rows").onchange=e=>{const d=e.target.dataset;if(d.k){rows[d.i][d.k]=d.k=="a"?+e.target.value:e.target.value;draw()}};$("#rows").onclick=e=>{if(e.target.dataset.x){rows.splice(e.target.dataset.x,1);draw()}};
$("#add").onclick=()=>{rows.push({n:"New row",s:"Planned",a:0});draw()};$("#q").oninput=draw;draw();`,
  }),
  cards: () => ({
    body: `<main><div class="card fc" id="card" tabindex="0"><p class="muted" id="side">Spanish</p><h2 id="word"></h2><p class="muted">Tap to flip</p></div><div class="ctl"><button id="no">Didn't know</button><button class="primary" id="yes">Knew it</button></div><p class="muted" id="score"></p></main>`,
    css: `.fc{max-width:460px;margin:20px auto;min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;padding:20px}.fc h2{font-size:34px;margin:8px 0}
.ctl{display:flex;gap:10px;justify-content:center}#score{text-align:center}`,
    js: `const deck=[["hola","hello"],["gracias","thank you"],["perro","dog"],["agua","water"],["libro","book"],["casa","house"],["amigo","friend"],["comer","to eat"]];let i=0,flip=false,s=store.get("score",{y:0,n:0});
function draw(){$("#word").textContent=deck[i][flip?1:0];$("#side").textContent=flip?"English":"Spanish";$("#score").textContent="Known "+s.y+" · Learning "+s.n;store.set("score",s)}
$("#card").onclick=()=>{flip=!flip;draw()};const next=k=>{s[k]++;i=(i+1)%deck.length;flip=false;draw()};$("#yes").onclick=()=>next("y");$("#no").onclick=()=>next("n");draw();`,
  }),
  timer: () => ({
    body: `<main class="tm"><div class="ring" id="ring"><b id="time">5:00</b><span id="phase" class="muted">Ready</span></div><div class="ctl"><button data-m="1">1 min</button><button data-m="5">5 min</button><button data-m="10">10 min</button></div><button class="primary" id="go">Start</button><p class="muted" id="done"></p></main>`,
    css: `.tm{display:flex;flex-direction:column;align-items:center;gap:16px;padding-top:30px}.ring{width:240px;height:240px;border-radius:50%;border:10px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:transform 4s ease-in-out,border-color .3s}
.ring.in{transform:scale(1.08);border-color:var(--accent)}.ring b{font-size:44px;font-weight:600}.ctl{display:flex;gap:8px}`,
    js: `let total=300,left=300,run=null,n=store.get("sessions",0);const fmt=s=>Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
function draw(){$("#time").textContent=fmt(left);$("#go").textContent=run?"Pause":"Start";$("#done").textContent=n+" sessions completed"}
document.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{total=left=b.dataset.m*60;clearInterval(run);run=null;draw()});
$("#go").onclick=()=>{if(run){clearInterval(run);run=null}else run=setInterval(()=>{left--;const br=(total-left)%8<4;$("#ring").classList.toggle("in",br);$("#phase").textContent=br?"Breathe in":"Breathe out";if(left<=0){clearInterval(run);run=null;left=total;n++;store.set("sessions",n);$("#phase").textContent="Well done"}draw()},1000);draw()};draw();`,
  }),
  landing: (name) => ({
    body: `<section class="hero"><h2>Build something people love.</h2><p class="muted">${esc(name)} helps you go from idea to launch, faster. Simple, fast and made for you.</p><a class="btn" href="#contact">Get started</a></section>
<main><div class="grid"><div class="card f"><b>⚡ Fast</b><p class="muted">Loads instantly and works on any device.</p></div><div class="card f"><b>🔒 Private</b><p class="muted">Your data stays yours, always.</p></div><div class="card f"><b>✨ Simple</b><p class="muted">Everything you need, nothing you don't.</p></div></div>
<h2 class="c">Pricing</h2><div class="grid"><div class="card f"><b>Free</b><h3>$0</h3><p class="muted">For getting started.</p></div><div class="card f hi"><b>Pro</b><h3>$9/mo</h3><p class="muted">For growing teams.</p></div><div class="card f"><b>Team</b><h3>$29/mo</h3><p class="muted">For whole companies.</p></div></div>
<form id="contact" class="card"><h2>Get in touch</h2><input placeholder="Your email" type="email" required><textarea placeholder="Message" rows="3"></textarea><button class="primary">Send</button><p id="ok" class="muted" hidden>Thanks, we'll be in touch.</p></form></main>`,
    css: `.hero{text-align:center;padding:70px 20px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 14%,transparent),transparent)}.hero h2{font-size:clamp(30px,5vw,52px);margin:0 0 10px;letter-spacing:-.03em}
.btn{display:inline-block;margin-top:14px;background:var(--accent);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:700px){.grid{grid-template-columns:1fr}}
.f{padding:18px}.f h3{font-size:28px;margin:6px 0}.hi{border-color:var(--accent)}.c{text-align:center;margin:40px 0 16px}#contact{max-width:520px;margin:40px auto;padding:20px;display:flex;flex-direction:column;gap:10px}#contact h2{margin:0}`,
    js: `$("#contact").onsubmit=e=>{e.preventDefault();$("#ok").hidden=false;e.target.reset()};`,
  }),
};

/** Builds a template app for a request. Returns the summary line and the HTML. */
export function templateApp(text: string, opts: { site?: string; name?: string; accent?: string } = {}) {
  const kind = kindFor(text, !!opts.site);
  const h = hash(text + (opts.site ?? ""));
  const name = opts.name || NAMES[kind][h % NAMES[kind].length];
  const accent = opts.accent || ACCENTS[h % ACCENTS.length];
  const t = T[kind](name);
  return {
    kind, name,
    note: `Built ${name}, a simple ${kind === "landing" ? "landing page" : `${kind} app`} from a ready-made template. Add a Claude key in AI settings for fully custom apps.`,
    html: shell(name, accent, t.body, t.css, t.js),
  };
}

const COLORS: Record<string, string> = {
  red: "#DC2626", orange: "#EA580C", yellow: "#CA8A04", gold: "#CA8A04", green: "#16A34A", teal: "#0D9488",
  blue: "#2563EB", navy: "#1E3A8A", purple: "#7C3AED", violet: "#7C3AED", pink: "#DB2777", black: "#111827", gray: "#4B5563", grey: "#4B5563",
};

/**
 * Simple-mode changes: the accent color, dark mode, and the app's name. Returns
 * null when the request asks for something only the AI can do.
 */
export function templateChange(html: string, request: string): { html: string; note: string } | null {
  let out = html;
  const done: string[] = [];
  const color = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`, "i").test(request)) ||
    request.match(/#[0-9a-f]{6}\b/i)?.[0];
  if (color) {
    const hex = COLORS[color.toLowerCase()] ?? color;
    out = out.replace(/--accent:#[0-9a-fA-F]{3,8}/, `--accent:${hex}`);
    done.push(`made the accent ${color.startsWith("#") ? hex : color}`);
  }
  if (/\bdark\b/i.test(request) && !/\blight\b/i.test(request)) {
    out = out.replace("@media (prefers-color-scheme:dark){:root{", ":root{").replace(/color-scheme:dark}}/, "color-scheme:dark}");
    done.push("switched it to dark mode");
  }
  const rename = request.match(/(?:call it|name it|rename (?:it )?to|named)\s+["']?([\w ]{2,30}?)["']?\s*$/i);
  if (rename) {
    const name = rename[1].trim();
    const old = out.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (old) out = out.split(old).join(name);
    done.push(`renamed it to ${name}`);
  }
  return done.length ? { html: out, note: `Done: I ${done.join(", ")}.` } : null;
}
