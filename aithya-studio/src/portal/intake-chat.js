export function mountIntakeChat(host,{db,mode,draft={},onReview,onManual}) {
  const isProfile = mode === "profile";
  const opening = isProfile ?
    "What name would you like to use on your DraftDeck profile?" :
    "What are you building? Describe the event, deadline and goal, or attach the rulebook, slides or screenshots you want me to read.";
  host.innerHTML = '<div class="intake-conversation"><div class="intake-log" role="log" aria-label="Gemini conversation"></div>' +
    '<form class="intake-compose"><label for="intake-message">Message Gemini</label>' +
    '<textarea rows="2" maxlength="3200" id="intake-message" placeholder="Write a message"></textarea>' +
    (isProfile ? '' : '<label class="intake-attach">Attach PDFs or images <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp,image/gif"></label>') +
    '<p class="shared-muted">Messages and selected files are sent to Google Gemini.</p>' +
    '<div class="shared-actions"><button class="button primary">Send</button>' +
    '<button type="button" class="button subtle" id="intake-review">Review details</button>' +
    '<button type="button" class="button subtle" id="intake-manual">Enter manually</button></div>' +
    '<p role="status" class="intake-status"></p></form></div>';
  const log=host.querySelector(".intake-log");
  const form=host.querySelector("form");
  const text=host.querySelector("textarea");
  const attachment=host.querySelector("[type=file]");
  const feedback=host.querySelector(".intake-status");
  const review=host.querySelector("#intake-review");
  const history=[];
  let collected={...draft};
  let busy=false;
  function append(role,message) {
    const item=document.createElement("p");
    item.className="intake-message " + role;
    item.textContent=message;
    log.append(item);
    log.scrollTop=log.scrollHeight;
  }
  append("assistant",opening);
  review.disabled=!Object.keys(collected).length;
  review.onclick=()=>onReview(collected);
  host.querySelector("#intake-manual").onclick=()=>onManual(collected);
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
    feedback.textContent="Gemini is reading your message…";
    try {
      const {data:{session}}=await db.auth.getSession();
      if (!session) throw Error("Sign in again to continue.");
      const body=new FormData();
      body.set("mode",mode);
      body.set("message",message);
      body.set("history",JSON.stringify(history.slice(-14)));
      body.set("draft",JSON.stringify(collected));
      files.forEach(file=>body.append("attachment",file));
      const response=await fetch("/api/intake",{method:"POST",headers:{authorization:"Bearer "+session.access_token},body,signal:AbortSignal.timeout(55000)});
      const next=await response.json();
      if (!response.ok) throw Error(next.error || "Gemini is unavailable.");
      if (!host.isConnected) return;
      const sent=[message,...files.map(file=>file.name)].filter(Boolean).join(" · ");
      append("member",sent);
      append("assistant",next.reply);
      history.push({role:"member",text:sent.slice(0,3200)},{role:"assistant",text:next.reply});
      collected={...collected,...next.fields};
      text.value="";
      if (attachment) attachment.value="";
      feedback.textContent=Object.keys(collected).length ? "Draft details are ready to review." : "";
    } catch (error) {feedback.textContent=error.message;}
    finally {busy=false;event.submitter.disabled=false;review.disabled=!Object.keys(collected).length;}
  };
}
