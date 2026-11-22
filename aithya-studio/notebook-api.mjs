const maxFile = 15 * 1024 * 1024;
const emptyBook = () => ({brief:{},members:[],tasks:[],finalized:false});
const briefFields = ['problem','theme','deadline','stack','criteria','rules','ai','workflow','deliverables'];
function validBook(book) {
  const string = (value,max) => typeof value === 'string' && value.length <= max;
  const list = (value,limit,validate) => Array.isArray(value) && value.length <= limit && value.every(validate);
  return book && typeof book.finalized === 'boolean' && book.brief && typeof book.brief === 'object'
    && Object.entries(book.brief).every(([k,v]) => briefFields.includes(k) && string(v,4000))
    && list(book.members,100,m => m && string(m.name,80) && m.name.trim() && string(m.role,80)
      && string(m.skills,300) && string(m.hours,5) && string(m.evidence,600) && string(m.verified,300))
    && list(book.tasks,250,t => t && string(t.title,200) && t.title.trim() && string(t.owner,80) && ['Open','In progress','Done'].includes(t.state));
}
async function notebook(request,env,user,url) {
  const repo = (url.searchParams.get('repo') || '').toLowerCase();
  if (!isRepo(repo)) return json({error:'Choose a repository.'},400);
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) return json({error:'Open the project before editing.'},403);
  try {
    if (url.pathname === '/api/documents') {
      const prefix = encodeURIComponent(user.id) + '/' + repo + '/';
      const id = url.searchParams.get('id');
      if (id && !/^[0-9a-f-]{36}$/.test(id)) return json({error:'Invalid file.'},400);
      if (request.method === 'GET' && !id) {
        const {objects} = await env.FILES.list({prefix,include:['customMetadata']});
        return json({files:objects.map(o => ({id:o.key.slice(prefix.length),name:o.customMetadata?.name || 'Document',size:o.size}))});
      }
      if (request.method === 'GET' && id) {
        const obj = await env.FILES.get(prefix + id);
        if (!obj) return json({error:'File missing.'},404);
        return new Response(obj.body,{headers:{...responseHeaders,'content-type':'application/octet-stream','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(obj.customMetadata?.name || 'Document')}});
      }
      if (request.method === 'POST' && !id) {
        const name = (url.searchParams.get('name') || '').split(/[\\/]/).pop();
        if (!name || name.length>180 || !/\.(pdf|txt|md|docx)$/i.test(name)) return json({error:'Choose a PDF, text, Markdown, or Word document.'},400);
        if (Number(request.headers.get('content-length')) > maxFile) return json({error:'Maximum file size is 15 MB.'},413);
        const bytes = await request.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > maxFile) return json({error:'Choose a file between 1 byte and 15 MB.'},400);
        const newId = crypto.randomUUID();
        await env.FILES.put(prefix+newId,bytes,{customMetadata:{name}});
        return json({id:newId,name},201);
      }
      return json({error:'Method not allowed.'},405);
    }
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT revision,contents FROM project_notes WHERE user_id=? AND repository=?').bind(user.id,repo).first();
      return json(row ? {revision:row.revision,book:JSON.parse(row.contents)} : {revision:0,book:emptyBook()});
    }
    if (request.method !== 'PUT') return json({error:'Method not allowed.'},405);
    const body = await request.json();
    if (!validBook(body.book) || !Number.isSafeInteger(body.revision) || body.revision<0) return json({error:'Check the project fields and try again.'},400);
    const value = JSON.stringify(body.book);
    const stmt = body.revision===0
      ? env.DB.prepare('INSERT OR IGNORE INTO project_notes VALUES(?,?,1,?)').bind(user.id,repo,value)
      : env.DB.prepare('UPDATE project_notes SET contents=?,revision=revision+1 WHERE user_id=? AND repository=? AND revision=?').bind(value,user.id,repo,body.revision);
    const result = await stmt.run();
    return result.meta.changes ? json({revision:body.revision+1}) : json({error:'Another tab updated this project. Reopen the section before saving.'},409);
  } catch { return json({error:'Project storage is unavailable. Please try again.'},503); }
}
