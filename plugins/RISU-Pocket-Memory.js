//@name risu_pocket_original_scenes
//@display-name 원문 기억
//@api 3.0
//@version 1.0.0
(async () => {
const noise = new Set('그때 그거 전에 예전 예전에 지난 장면 뭐라고 어떻게 다시 관련 대해 했던 기억 그녀 그는 그리고 그냥 대체 이번 그가 함께 있었다 what when where which with were that have then about they from said'.split(' '));
const families = [
    ['약속', '맹세', '서약', '하기로', 'promise', 'vow'],
    ['비밀', '발설', '누설', '함구', 'secret'],
    ['배신', '배반', 'betray'],
    ['화해', '사과', '용서', 'forgive', 'apolog'],
    ['이별', '결별', '헤어지', 'breakup'],
];
function queryTerms(query) {
    const words = query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const terms = new Map();
    for (const word of words) {
        if (word.length < 2 || noise.has(word))
            continue;
        const family = families.find(group => group.some(term => word.startsWith(term)));
        const stem = word.replace(/(에게서는|에게서|에서는|한테서|에게|한테|으로|에서|하고|했던|처럼|까지|께서|이랑|이라도|에는|은|는|이|가|을|를|와|과|에|의|도)$/u, '');
        const term = family?.[0] ?? (stem.length >= 2 ? stem : word);
        if (!noise.has(term))
            terms.set(term, family ?? [term]);
    }
    return Array.from(terms.values()).slice(0, 32);
}
function sceneBody(raw) {
    return raw.replace(/<(thoughts?|style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
        .replace(/\{\{[^{}]*\}\}/g, '').replace(/<[^>\n]*>/g, ' ')
        .replace(/data:[\w/+.-]+;base64,[a-z\d+/=]+/gi, '').trim();
}
function available(messages, index, cutoff) {
    const message = messages[index];
    return index > cutoff && !message.disabled && !message.isComment && typeof message.data === 'string'
        && !message.data.startsWith('\uEF01COLDSTORAGE\uEF01');
}
// Work on overlapping passages so a long turn can be found by a line near its end.
function searchScenes(messages, query, end = messages.length, limit = 20, literal = '') {
    const terms = queryTerms(query);
    if (!terms.length && !literal)
        return [];
    const endIndex = Math.min(end, messages.length);
    const cutoff = messages.findLastIndex(m => m.disabled === 'allBefore');
    const hits = [];
    for (let i = cutoff + 1; i < endIndex; i++) {
        if (!available(messages, i, cutoff))
            continue;
        const body = sceneBody(messages[i].data);
        // Direct matches take precedence when a reader searches for a line, even for a single character.
        const pos = literal ? body.toLowerCase().indexOf(literal) : -1;
        if (pos >= 0) {
            const start = Math.max(0, pos - 100);
            hits.push({ id: messages[i].chatId ?? '', turn: i + 1, role: messages[i].role, score: Number.MAX_SAFE_INTEGER,
                matches: 1, excerpt: body.slice(start, Math.max(start + 420, pos + literal.length)) });
            continue;
        }
        let best;
        for (let start = 0; start < body.length; start += 320) {
            const excerpt = body.slice(start, start + 420).trim();
            const text = excerpt.normalize('NFKC').toLowerCase();
            let matches = 0, score = 0;
            for (const group of terms) {
                if (group.some(term => text.includes(term))) {
                    matches++;
                    score += group.length > 1 ? 4 : 1 + Math.min(4, group[0].length) / 2;
                }
            }
            if (!matches || (best && best.score >= score))
                continue;
            best = { id: messages[i].chatId ?? '', turn: i + 1, excerpt, role: messages[i].role, score, matches };
        }
        if (best)
            hits.push(best);
    }
    return hits.sort((a, b) => b.score - a.score || b.turn - a.turn).slice(0, limit);
}
// Links are scoped to one character. Follow only the explicitly chosen ancestry.
function linkedRooms(chat, siblings) {
    const byId = new Map(siblings.filter(room => room.id).map(room => [room.id, room]));
    const rooms = [chat];
    const seen = new Set([chat.id]);
    let parent = chat.sceneRecallParent;
    while (parent && !seen.has(parent)) {
        const room = byId.get(parent);
        if (!room)
            break;
        rooms.push(room);
        seen.add(parent);
        parent = room.sceneRecallParent;
    }
    return rooms;
}
const coldHeader = '\uEF01COLDSTORAGE\uEF01';
function isArchivedRoom(room) {
    return room.message[0]?.data?.startsWith(coldHeader);
}
// Read archived rooms without changing the stored pointer or restoring their Hypa data.
async function readSceneRooms(rooms, read) {
    return Promise.all(rooms.map(async (room) => {
        if (!isArchivedRoom(room))
            return room;
        try {
            const data = await read(room.message[0].data.slice(coldHeader.length));
            const messages = Array.isArray(data) ? data : data?.message;
            if (Array.isArray(messages) && messages.every(m => m && typeof m.data === 'string')) {
                return { ...room, message: messages };
            }
        }
        catch { /* Keep the pointer for a later retry and show the room as unavailable. */ }
        return room;
    }));
}
function searchRooms(rooms, query, currentEnd = rooms[0].message.length, limit = 20, literal = '') {
    const hits = rooms.flatMap((room, i) => searchScenes(room.message, query, i ? room.message.length : currentEnd, limit, literal)
        .map(hit => ({ ...hit, roomId: room.id, roomName: room.name })));
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
function locateSource(rooms, source) {
    const room = source.roomId ? rooms.find(r => r.id === source.roomId) : rooms[0];
    if (!room)
        return;
    const turnIndex = (source.turn ?? 0) - 1;
    const i = !source.id || room.message[turnIndex]?.chatId === source.id
        ? turnIndex : room.message.findIndex(m => m.chatId === source.id);
    if (i < 0 || i >= room.message.length || !available(room.message, i, room.message.findLastIndex(m => m.disabled === 'allBefore')))
        return;
    const body = sceneBody(room.message[i].data);
    if (!source.id && !body.includes(source.excerpt))
        return;
    return { room, i, body };
}
function selectedScene(chat, rooms = [chat]) {
    const pin = chat.sceneRecallPin;
    if (!pin)
        return;
    const location = locateSource(rooms, pin);
    if (!location)
        return;
    const { room, i, body } = location;
    const excerpt = pin.excerpt && body.includes(pin.excerpt) ? pin.excerpt : body.slice(0, 420).trim();
    if (excerpt)
        return { id: pin.id, ...(pin.roomId ? { roomId: room.id, roomName: room.name } : {}), turn: i + 1, excerpt };
}
function recallForRequest(chat, prompt, rooms = [chat]) {
    const pin = selectedScene(chat, rooms);
    if (pin)
        return [pin];
    if (chat.sceneRecallAuto === false)
        return [];
    const lastUser = chat.message.findLastIndex(m => m.role === 'user' && !m.disabled && !m.isComment);
    if (lastUser < 0 || chat.message.slice(lastUser).some(m => m.disabled === 'allBefore'))
        return [];
    const query = sceneBody(chat.message[lastUser].data).slice(-800);
    const present = new Set(prompt.map(m => m.memo));
    const seen = new Set();
    const sources = [];
    for (const hit of searchRooms(rooms, query, Math.max(0, lastUser - 2), Infinity)) {
        if (hit.matches < 2 && hit.score < 3)
            continue;
        if (hit.roomId === chat.id && hit.id && present.has(hit.id))
            continue;
        if (seen.has(hit.excerpt) || prompt.some(m => m.content.includes(hit.excerpt)))
            continue;
        const { id, turn, excerpt, roomId, roomName } = hit;
        sources.push({ id, turn, excerpt, roomId, roomName });
        seen.add(excerpt);
        if (sources.length === 2)
            break;
    }
    return sources;
}
function scenePrompt(sources) {
    return {
        role: 'user',
        content: 'Earlier scene excerpts from this same story, provided as historical context. Keep subsequent developments in effect.\n'
            + JSON.stringify(sources.map(({ roomName, turn, excerpt }) => ({ room: roomName, turn, excerpt }))),
    };
}


const api = Risuai
const prefix = 'pocket-original-scenes-v1:'
const sent = new Map()
const keyFor = (c, r) => JSON.stringify([c.chaId, r.id])
const readPrefs = async id => JSON.parse(await api.pluginStorage.getItem(prefix + id) || '{}')

async function story() {
    const index = await api.getCurrentCharacterIndex()
    if (index < 0) throw Error('먼저 채팅방을 열어 주세요.')
    const c = await api.getCharacterFromIndex(index)
    const current = c?.chats?.[c.chatPage]
    if (!current?.id) throw Error('방 식별자를 읽을 수 없습니다. 채팅방을 다시 열어 주세요.')
    const prefs = await readPrefs(c.chaId)
    const rooms = c.chats.map(room => ({
        ...room, sceneRecallParent:prefs[room.id]?.parent,
        sceneRecallPin:prefs[room.id]?.pin, sceneRecallAuto:prefs[room.id]?.auto !== false
    }))
    return { c, index, current:rooms[c.chatPage], rooms, chain:linkedRooms(rooms[c.chatPage], rooms) }
}

async function before(messages, mode) {
    if (mode !== 'model' || !Array.isArray(messages)) return messages
    try {
        const {c, current, chain} = await story()
        const k = keyFor(c,current)
        if (messages.some(m => typeof m.content === 'string' && m.content.startsWith('Earlier scene excerpts from this same story,'))) return messages
        const textMessages = messages.filter(m => typeof m.content === 'string')
        const lastInput = current.message.findLast(m => m.role === 'user' && !m.disabled && !m.isComment)
        // The hook has no room argument. Confirm the active turn also appears in this request.
        if (!lastInput || !textMessages.some(m => m.role === 'user' && (
            (lastInput.chatId && m.memo === lastInput.chatId) || (lastInput.data && m.content.includes(lastInput.data))
        ))) { sent.delete(k); return messages }
        const sources = recallForRequest(current,textMessages,chain)
            .map(source => ({...source,excerpt:source.excerpt.slice(0,420)}))
        const index = messages.findLastIndex(m => m.role === 'user')
        if (!sources.length || index < 0) { sent.delete(k); return messages }
        const output = messages.slice()
        output.splice(index,0,scenePrompt(sources))
        sent.set(k,sources)
        return output
    } catch { return messages }
}

const doc = document
doc.head.insertAdjacentHTML('beforeend','<meta name="viewport" content="width=device-width,initial-scale=1">')
const style = doc.createElement('style')
style.textContent = `
*{box-sizing:border-box}body{margin:0;background:#171919;color:#f3f3e9;font:16px/1.55 system-ui,sans-serif}main{max-width:44rem;margin:auto;padding:1rem 1rem 3rem}button,input,select,textarea{font:inherit;color:inherit}button{background:#343833;border:0;border-radius:.5rem;padding:.5rem .75rem;cursor:pointer}button:disabled{opacity:.45}header,nav{display:flex;gap:.5rem;align-items:center;justify-content:space-between}h1,h2{font-size:1.2rem;margin:.4rem 0}label{display:block;margin:.7rem 0}select,input[type=search],textarea{border-radius:.4rem;background:#252826;border:1px solid #859078;padding:.55rem;width:100%}article{padding:.65rem 0;border-bottom:1px solid #596050}article button:first-child{display:block;text-align:left;width:100%;background:transparent;padding:0}small{color:#c8d6b9;display:block}p,pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:.4rem 0 .8rem}textarea{min-height:45vh}#status{color:#e0efb7}[hidden]{display:none!important}
`
doc.head.append(style)
doc.body.innerHTML = `<main><section id="list"><header><h1>원문 기억</h1><button id="close">닫기</button></header>
<label><input type="checkbox" id="auto"> 전개할 때 관련 원문 자동 참고</label>
<label>이전 방 이어쓰기<select id="parent"></select></label><small id="range"></small>
<label>원문 검색<input id="query" type="search" placeholder="인물 이름이나 대사의 일부"></label>
<div id="pin"></div><div id="hits"></div><button id="more" hidden>결과 더 보기</button></section>
<section id="detail" hidden><nav><button id="back">검색 결과로</button><button id="edit">원문 수정</button></nav><h2 id="title" tabindex="-1"></h2><pre id="body"></pre>
<textarea id="draft" aria-label="메시지 원문" hidden></textarea><nav id="editbar" hidden><button id="save">저장</button><button id="cancel">수정 취소</button></nav>
<nav id="near"><button id="prev">이전 메시지</button><button id="next">다음 메시지</button></nav></section><p role="status" id="status"></p></main>`
const el = id => doc.getElementById(id)
const text = (id, value) => {el(id).textContent=value}
const show = (id, visible) => {el(id).hidden=!visible}
const button = (label, fn) => {const b=doc.createElement('button');b.textContent=label;b.onclick=guard(fn);return b}
function guard(fn) {
    return async (...args) => {try {await fn(...args)} catch(e) {text('status',e?.message || String(e))}}
}
let requestAllowed=false
let state, opened, original, listY=0, count=20, busy=false
const idOf = s => keyFor(s.c,s.current)
async function refresh() {
    const next = await story()
    if (state && idOf(state)!==idOf(next)) throw Error('현재 방이 바뀌었습니다. 메뉴를 다시 열어 주세요.')
    state=next
}
async function setting(change) {
    await refresh()
    const p=await readPrefs(state.c.chaId)
    p[state.current.id]={...p[state.current.id], ...change}
    await api.pluginStorage.setItem(prefix+state.c.chaId,JSON.stringify(p))
    await refresh()
    controls()
    results()
}
function controls() {
    const {current,rooms,chain}=state
    el('auto').disabled=!requestAllowed
    el('auto').checked=requestAllowed && current.sceneRecallAuto
    if(!requestAllowed)text('status','자동 참고를 사용하려면 리수의 대화 내용 변경 권한을 허용해 주세요.')
    const select=el('parent')
    select.replaceChildren(new Option('연결 안 함',''))
    for(const room of rooms) {
        if(room.id && !linkedRooms(room,rooms).some(r=>r.id===current.id)) select.add(new Option(room.name,room.id))
    }
    select.value=current.sceneRecallParent || ''
    const cold=chain.filter(isArchivedRoom)
    text('range',chain.map(r=>r.name).reverse().join(' → ')+(cold.length?' · 보관된 방은 리수에서 한 번 열어 주세요: '+cold.map(r=>r.name).join(', '):''))
    const pin=selectedScene(current,chain)
    const area=el('pin');area.replaceChildren()
    if(pin){const info=doc.createElement('small');info.textContent='고정한 원문 · '+pin.roomName+' · '+pin.turn+'번';area.append(info,button('고정 해제',()=>setting({pin:null})))}
}
function results() {
    const area=el('hits');area.replaceChildren()
    const query=el('query').value.trim()
    const rows=query ? searchRooms(state.chain,query,state.current.message.length,Infinity,query.toLowerCase()) : (sent.get(idOf(state)) || [])
    if(!query && rows.length){const h=doc.createElement('h2');h.textContent='직전 요청에 첨부한 원문';area.append(h)}
    if(query && !rows.length) area.textContent='일치하는 장면이 없습니다.'
    for(const row of rows.slice(0,count)){
        const article=doc.createElement('article')
        const open=button('',()=>openScene(row,true))
        const caption=doc.createElement('small'), line=doc.createElement('p')
        caption.textContent=row.roomName+' · '+row.turn+'번 메시지';line.textContent=row.excerpt
        open.append(caption,line)
        article.append(open,button('답변에 참고하도록 고정',()=>setting({pin:row})));area.append(article)
    }
    show('more',rows.length>count)
}
function openScene(row,fromList) {
    const loc=locateSource(state.chain,row)
    if(!loc)throw Error('현재 연결된 방에서 원문을 찾지 못했습니다.')
    if(fromList)listY=window.scrollY
    opened={...row,turn:loc.i+1}; original=loc.room.message[loc.i].data
    text('title',loc.room.name+' · '+opened.turn+'번 메시지');text('body',loc.body)
    show('list',false);show('detail',true);editMode(false);text('status','')
    window.scrollTo(0,0);el('title').focus()
}
function editMode(on) {
    for(const id of ['draft','editbar'])show(id,on)
    for(const id of ['body','near','edit'])show(id,!on)
    el('back').disabled=on
    if(on){el('draft').value=original;el('draft').focus()}
}
function step(d) {
    const loc=locateSource(state.chain,opened)
    for(let i=loc.i+d;i>=0&&i<loc.room.message.length;i+=d){
        const row={roomId:loc.room.id,roomName:loc.room.name,id:loc.room.message[i].chatId||'',turn:i+1,excerpt:''}
        if(locateSource(state.chain,row)){openScene(row,false);return}
    }
}
async function save() {
    if(busy)return
    busy=true
    el('save').disabled=el('cancel').disabled=true
    try{
        if(!await api.requestPluginPermission('dbWrite'))throw Error('원문 수정에는 리수의 저장 권한이 필요합니다.')
        await refresh()
        const loc=locateSource(state.chain,opened)
        if(!loc || isArchivedRoom(loc.room) || loc.room.message[loc.i].data!==original)throw Error('원문이 바뀌었습니다. 내용을 복사하고 다시 열어 주세요.')
        const idx=state.rooms.findIndex(r=>r.id===loc.room.id)
        const room=await api.getChatFromIndex(state.index,idx)
        const target=locateSource([room],opened)
        if(!target || room.id!==loc.room.id || room.isStreaming || room.message[target.i].data!==original)throw Error('방 또는 원문이 바뀌었습니다. 다시 열어 주세요.')
        const value=el('draft').value
        const id=room.message[target.i].chatId || ('scene-' + Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'))
        room.message[target.i].chatId=id;room.message[target.i].data=value
        await api.setChatToIndex(state.index,idx,room)
        await refresh()
        const updated={...opened,id,excerpt:value.slice(0,420)}
        const check=locateSource(state.chain,updated)
        if(!check||check.room.message[check.i].data!==value)throw Error('저장 결과를 확인하지 못했습니다.')
        openScene(updated,false);text('status','저장했습니다.')
    }finally{busy=false;el('save').disabled=el('cancel').disabled=false}
}
el('close').onclick=guard(()=>api.hideContainer())
el('auto').onchange=guard(()=>setting({auto:el('auto').checked}))
el('parent').onchange=guard(()=>setting({parent:el('parent').value}))
let timer
el('query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{count=20;results()},120)}
el('more').onclick=()=>{count+=20;results()}
el('back').onclick=()=>{show('detail',false);show('list',true);text('status','');results();window.scrollTo(0,listY)}
el('edit').onclick=()=>editMode(true);el('cancel').onclick=()=>editMode(false)
el('prev').onclick=guard(()=>step(-1));el('next').onclick=guard(()=>step(1));el('save').onclick=guard(save)
async function open() {
    await api.showContainer('fullscreen')
    state=undefined
    show('list',true);show('detail',false);text('status','')
    el('query').value='';count=20
    await refresh();controls();results();window.scrollTo(0,0)
}
await api.registerButton({name:'원문 기억',location:'chat',icon:'',iconType:'none'},guard(open))
await api.addRisuReplacer('beforeRequest',before)
requestAllowed=await api.requestPluginPermission('replacer')

})().catch(error => console.error("원문 기억",error))
