export function mountIntakeChat(host,{db,mode,draft={},onReview,onManual}) {
  const isProfile = mode === "profile";
  const opening = isProfile ?
    "Tell me your name, how many hackathons you’ve done, and what roles or tools you’ve used. You can answer in one message. First hackathon? Tell me what you’ve tried or want to work on." :
    "What are you building? Describe the event, deadline and goal, or attach the rulebook, slides or screenshots you want me to read.";
  host.innerHTML = '<div class="intake-conversation"><div class="intake-log" role="log" aria-label="Gemini conversation"></div>' +
    '<form class="intake-compose"><label for="intake-message">Message Gemini</label>' +
    '<textarea rows="2" maxlength="3200" id="intake-message" placeholder="Write a message"></textarea>' +
    (isProfile ? '' : '<label class="intake-attach">Attach PDFs or images <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp,image/gif"></label>') +
    '<p class="shared-muted">' + (isProfile ? 'Messages are sent to Google Gemini.' : 'Messages and selected files are sent to Google Gemini.') + '</p>' +
    '<div class="shared-actions"><button class="button primary">Send</button>' +
    '<button type="button" class="button subtle" id="intake-review">Review details</button>' +
    '<button type="button" class="button subtle" id="intake-manual">Enter manually</button></div>' +
    '<p role="status" class="intake-status"></p></form><ul class="intake-facts" aria-label="Details captured in this turn" hidden></ul></div>';
  const log=host.querySelector(".intake-log");
  const form=host.querySelector("form");
  const text=host.querySelector("textarea");
  const attachment=host.querySelector("[type=file]");
  const feedback=host.querySelector(".intake-status");
  const review=host.querySelector("#intake-review");
  const facts=host.querySelector(".intake-facts");
  const manual=host.querySelector("#intake-manual");
  const history=[];
  let collected={...draft};
  let busy=false;
  function append(role,message) {
    const item=document.createElement("p");
    item.className="intake-message " + role;
    item.textContent=message;
    log.append(item);
    log.scrollTop=log.scrollHeight;
    return item;
  }
  append("assistant",opening);
  review.disabled=!Object.keys(collected).length;
  review.onclick=()=>onReview(collected);
  manual.onclick=()=>onManual(collected);
  form.onsubmit=async event=>{
    event.preventDefault();
    if (busy) return;
    const message=text.value.trim();
    const files=[...(attachment?.files||[])];
    if (!message&&!files.length) {feedback.textContent="Write a message or choose a file.";return;}
    if (files.length>4 || files.reduce((size,file)=>size+file.size,0)>3*1024*1024) {
      feedback.textContent="Attach up to four files totaling 3 MB.";return;
    }
    busy=true;
    event.submitter.disabled=true;
    review.disabled=true;
    manual.disabled=true;
    text.readOnly=true;
    if (attachment) attachment.disabled=true;
    const sent=[message,...files.map(file=>file.name)].filter(Boolean).join(" · ");
    const pending=append("member",sent);
    feedback.textContent="Gemini is finding details…";
    try {
      const {data:{session}}=await db.auth.getSession();
      if (!session) throw Error("Sign in again to continue.");
      const body=new FormData();
      body.set("mode",mode);
      body.set("message",message);
      body.set("history",JSON.stringify(history.slice(isProfile ? -4 : -14)));
      body.set("draft",JSON.stringify(collected));
      files.forEach(file=>body.append("attachment",file));
      const response=await fetch("/api/intake",{method:"POST",headers:{authorization:"Bearer "+session.access_token},body,signal:AbortSignal.timeout(isProfile ? 30000 : 55000)});
      const next=await response.json();
      if (!response.ok) throw Error(next.error || "Gemini is unavailable.");
      if (!pending.isConnected) return;
      append("assistant",next.reply);
      history.push({role:"member",text:sent.slice(0,3200)},{role:"assistant",text:next.reply});
      collected={...collected,...next.fields};
      if (isProfile) {
        facts.replaceChildren(...Object.entries(next.fields).flatMap(([key,value])=>{
          if (!value) return [];
          const item=document.createElement("li");
          item.textContent=key.charAt(0).toUpperCase()+key.slice(1)+" · "+value;
          return [item];
        }));
        facts.hidden=!facts.childElementCount;
      }
      text.value="";
      if (attachment) attachment.value="";
      feedback.textContent=Object.keys(collected).length ? "Draft details are ready to review." : "";
    } catch (error) {
      pending.remove();
      feedback.textContent=error.name === "TimeoutError" ? "Gemini is taking longer than usual. Your message is ready to retry." : error.message;
    } finally {
      busy=false;
      event.submitter.disabled=false;
      review.disabled=!Object.keys(collected).length;
      manual.disabled=false;
      text.readOnly=false;
      if (attachment) attachment.disabled=false;
    }
  };
}
