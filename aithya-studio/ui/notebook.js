'use strict';
let page = 'Activity';
let revision = 0;
let book;
let openVersion = 0;
const fields = {problem:'Problem statement',theme:'Competition theme',deadline:'Submission deadline',stack:'Technology stack',deliverables:'Expected deliverables',criteria:'Judging criteria',rules:'Requirements and restrictions',ai:'AI usage policy',workflow:'Workflow'};
const attr = escape;
const field = (key,label,value='',size=200,type='text') => '<label for="nb-'+key+'">'+attr(label)+'</label><input id="nb-'+key+'" name="'+key+'" type="'+type+'" maxlength="'+size+'" value="'+attr(value)+'" '+(key==='name'||key==='title'?'required':'')+'>';
const longField = (key,label,value='') => '<label for="nb-'+key+'">'+attr(label)+'</label><textarea name="'+key+'" id="nb-'+key+'" maxlength="4000" rows="3">'+attr(value)+'</textarea>';
const action = (name,label,idx) => '<button class="button subtle" data-do="'+name+'" '+(idx===undefined?'':'data-index="'+idx+'"')+'>'+attr(label)+'</button>';
const bookPath = (name,repo=active()?.repo) => '/api/'+name+'?repo='+encodeURIComponent(repo);
const note = text => '<p class="note">'+attr(text)+'</p>';
function editor(title,inputs,onSave) {
  const version=openVersion;
  const draftKey='aithya.draft.'+user.id+'.'+active().repo+'.'+title;
  openDialog(title,'<form id="note-form">'+inputs+'<p role="alert" id="note-error"></p><button class="button primary">Save changes</button></form>');
  const form=$('note-form');
  const saved=store.read(draftKey,null);
  if(saved) {
    for(const [key,value] of Object.entries(saved)) {
      const input=form.elements.namedItem(key);
      if(input) input.value=value;
    }
    $('note-error').textContent='Recovered your unsaved draft from this browser.';
  }
  let draftTimer;
  form.addEventListener('input',()=>{
    clearTimeout(draftTimer);
    draftTimer=setTimeout(()=>{
      const ok=store.write(draftKey,Object.fromEntries(new FormData(form)));
      $('note-error').textContent=ok?'Draft saved in this browser.':'Draft could not be saved. Keep this window open.';
    },500);
  });
  form.addEventListener('change',()=>store.write(draftKey,Object.fromEntries(new FormData(form))));
  $('note-form').onsubmit=async e=>{
    e.preventDefault();
    if(version!==openVersion) return;
    e.submitter.disabled=true;
    const candidate=structuredClone(book);
    try {
      onSave(candidate,Object.fromEntries(new FormData(e.currentTarget)));
      const result=await api(bookPath('notebook'),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({revision,book:candidate})});
      if(version!==openVersion) return;
      clearTimeout(draftTimer);try{localStorage.removeItem(draftKey);}catch{}
      revision=result.revision; book=candidate; $('dialog').close(); drawBook();
    } catch(err){ $('note-error').textContent=err.message; if(e.submitter)e.submitter.disabled=false; }
  };
}
async function showFiles(version) {
  const path=bookPath('documents');
  try {
    const {files}=await api(path);
    if(version!==openVersion || !$('file-list'))return;
    $('file-list').innerHTML=files.length ? files.map(file=>'<a class="file-row" href="'+path+'&amp;id='+encodeURIComponent(file.id)+'" download>'+attr(file.name)+'<small>'+Math.max(1,Math.round(file.size/1024))+' KB</small></a>').join('') : note('No project files yet.');
  }catch(err){if(version===openVersion && $('file-list'))$('file-list').textContent=err.message;}
}
function drawBook(){
 const main=$('notebook');
 if(page==='Brief'){
   const rows=Object.entries(fields).filter(([key])=>book.brief[key]);
   const readiness=[
     ['Problem statement',Boolean(book.brief.problem),'Brief'],
     ['Submission deadline',Boolean(book.brief.deadline),'Brief'],
     ['Expected deliverables',Boolean(book.brief.deliverables),'Brief'],
     ['Official requirements',Boolean(book.brief.rules),'Brief'],
     ['AI usage policy',Boolean(book.brief.ai),'Brief'],
     ['Team configured',book.members.length>0,'Team'],
     ['Workflow entered',Boolean(book.brief.workflow),'Brief']
   ];
   main.innerHTML='<section class="readiness"><h3>Setup readiness</h3><ul>'+readiness.map(([label,done])=>'<li><span>'+label+'</span><b class="'+(done?'complete':'attention')+'">'+(done?'Complete':'Needs attention')+'</b></li>').join('')+'</ul></section><div class="sheet"><section><header><h3>Project brief</h3>'+action('brief','Edit brief')+'</header>'+
     (rows.length?'<dl>'+rows.map(([k,label])=>'<dt>'+label+'</dt><dd>'+attr(book.brief[k])+'</dd>').join('')+'</dl>':note('Add the problem, deadline, and deliverables for this project.'))+
     '</section><section><header><h3>Files</h3><label class="button subtle upload">Upload file<input type="file" id="doc" accept=".pdf,.txt,.md,.docx"></label></header><div id="file-list"></div><p id="file-result" role="status"></p></section></div>';
   const version=openVersion, path=bookPath('documents');
   $('doc').onchange=async e=>{
     const input=e.target,file=input.files[0];if(!file)return;
     if(file.size>15*1024*1024){$('file-result').textContent='Maximum file size is 15 MB.';return;}
     input.disabled=true; $('file-result').textContent='Uploading…';
     try{
       await api(path+'&name='+encodeURIComponent(file.name),{method:'POST',body:file});
       if(version===openVersion){$('file-result').textContent='File saved.';await showFiles(version);}
     }catch(err){if(version===openVersion)$('file-result').textContent=err.message;}
     finally{input.disabled=false;input.value='';}
   };
   showFiles(version);
 } else if(page==='Team'){
   const complete=book.members.filter(m=>m.role&&m.hours&&m.skills).length;
   main.innerHTML='<header><div><h3>Team roster</h3>'+note(complete+' of '+book.members.length+' profiles have a role, availability, and skills.')+'</div>'+action('member','Add member')+'</header>'+
     book.members.map((m,i)=>'<article class="record"><div><b>'+attr(m.name)+'</b><p>'+attr([m.role,m.hours?m.hours+' h/week':'',m.skills].filter(Boolean).join(' · '))+'</p>'+
     (m.verified?'<small>Reviewed skills · '+attr(m.verified)+'</small>':'')+'</div>'+action('member','Edit',i)+'</article>').join('')+
     (book.members.length?'<footer>'+note(book.finalized?'Onboarding finalized.':'Onboarding open.')+action('final',book.finalized?'Reopen onboarding':'Finalize onboarding')+'</footer>':'');
 } else if(page==='Tasks'){
   const done=book.tasks.filter(t=>t.state==='Done').length;
   main.innerHTML='<header><div><h3>Task list</h3>'+note(done+' of '+book.tasks.length+' completed')+'</div>'+action('task','Add task')+'</header>'+
     book.tasks.map((t,i)=>'<article class="record"><div><b>'+attr(t.title)+'</b><p>'+attr(t.owner||'Unassigned')+'</p></div><span class="status">'+attr(t.state)+'</span>'+action('task','Edit',i)+'</article>').join('');
 }
}
$('notebook').addEventListener('click',e=>{
 const button=e.target.closest('[data-do]');if(!button)return;
 const type=button.dataset.do, i=button.hasAttribute('data-index')?Number(button.dataset.index):undefined;
 if(type==='brief')editor('Edit project brief',Object.entries(fields).map(([k,label])=>['deadline','theme','stack'].includes(k)?field(k,label,book.brief[k],180,k==='deadline'?'date':'text'):longField(k,label,book.brief[k])).join(''),(b,values)=>{
       if(values.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(values.deadline))throw Error('Enter a valid deadline.');
       b.brief=values;
     });
 if(type==='member'){
   const m=book.members[i]||{};
   editor(i===undefined?'Add team member':'Edit team member',field('name','Name',m.name,80)+field('role','Role',m.role,80)+field('hours','Hours available per week',m.hours,5,'number').replace('type="number"','type="number" min="0" max="168"')+field('skills','Self-assessed skills',m.skills,300)+field('verified','Reviewed skills and levels',m.verified,300)+field('evidence','Review evidence or link',m.evidence,600),(b,v)=>{
      if(!v.name.trim())throw Error('Enter a name.');
      if(b.members.some((member,index)=>index!==i && member.name.trim().toLowerCase()===v.name.trim().toLowerCase())) throw Error('This member already exists.');
      if(v.hours && (!Number.isFinite(Number(v.hours)) || Number(v.hours)<0 || Number(v.hours)>168))throw Error('Weekly availability must be between 0 and 168 hours.');
      if(v.verified.trim()&&!v.evidence.trim())throw Error('Add evidence for the skills review.');
      b.members[i??b.members.length]=v;b.finalized=false;
   });
 }
 if(type==='task'){
   const t=book.tasks[i]||{};editor(i===undefined?'Add task':'Edit task',field('title','Task',t.title,200)+field('owner','Owner',t.owner,80)+'<label for="nb-state">Status</label><select name="state" id="nb-state">'+['Open','In progress','Done'].map(v=>'<option '+(v===t.state?'selected':'')+'>'+v+'</option>').join('')+'</select>',(b,v)=>{if(!v.title.trim())throw Error('Enter a task title.');b.tasks[i??b.tasks.length]=v;});
 }
 if(type==='final'){
   const missing=book.members.filter(m=>!m.role||!m.hours||!m.skills).length;
   editor(book.finalized?'Reopen onboarding':'Finalize onboarding',note(book.finalized?'The roster will be open for onboarding.':missing?missing+' incomplete profiles. Saving records your decision to proceed.':'Every member has completed the core profile.'),(b)=>{b.finalized=!b.finalized;});
 }
});
async function changePage(next){
 const version=++openVersion;page=next;
 document.querySelectorAll('[data-page]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.page===next)));
 $('notebook').hidden=next==='Activity';$('activity-grid').hidden=next!=='Activity';
 if(next==='Activity'||!active())return;
 $('notebook').innerHTML=note('Opening project…');
 try{
   const data=await api(bookPath('notebook'));if(version!==openVersion)return;
   revision=data.revision;book=data.book;drawBook();
 }catch(err){if(version===openVersion)$('notebook').textContent=err.message;}
}
document.querySelector('.sections').onclick=e=>{const b=e.target.closest('[data-page]');if(b)changePage(b.dataset.page);};
document.addEventListener('project-selected',()=>changePage('Activity'));
