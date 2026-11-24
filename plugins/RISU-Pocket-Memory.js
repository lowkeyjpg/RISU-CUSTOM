//@name risu_pocket_original_scenes
//@display-name 📚 원문 기억
//@api 3.0
//@version 1.1.0
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
        if (sources.length >= (chat.attachLimit || 2))
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
    const c = typeof index === 'number' ? await api.getCharacterFromIndex(index) : await api.getCharacter()
    const current = c?.chats?.[c.chatPage]
    if (!current?.id) throw Error('방 식별자를 읽을 수 없습니다. 채팅방을 다시 열어 주세요.')
    const prefs = await readPrefs(c.chaId)
    const rooms = c.chats.map(room => ({
        ...room, sceneRecallParent:prefs[room.id]?.parent,
        pins:prefs[room.id]?.pins ?? (prefs[room.id]?.pin ? [prefs[room.id].pin] : []),
        attachLimit: Math.min(8,Math.max(1,Number(prefs[room.id]?.limit)||2)), sceneRecallAuto:prefs[room.id]?.auto !== false
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
        const sources = []
        function include(source) {
            const excerpt = source?.excerpt?.slice(0,420)
            if (!excerpt || sources.some(prior => prior.excerpt === excerpt) || textMessages.some(m => m.content.includes(excerpt))) return
            sources.push({...source, excerpt})
        }
        for (const pin of current.pins) {
            if (pin.enabled !== false) include(selectedScene({sceneRecallPin:pin},chain))
            if (sources.length >= current.attachLimit) break
        }
        if (sources.length < current.attachLimit && current.sceneRecallAuto) {
            for (const match of recallForRequest(current,textMessages,chain)) {
                include(match)
                if (sources.length >= current.attachLimit) break
            }
        }
        const index = messages.findLastIndex(m => m.role === 'user')
        if (!sources.length || index < 0) { sent.delete(k); return messages }
        const output = messages.slice()
        output.splice(index,0,scenePrompt(sources))
        sent.set(k,sources)
        return output
    } catch { return messages }
}

function createOffscriptSearchCore() {
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function date(value) {
    const match=String(value??'').trim().match(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?$/);
    if(!match)return null;
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
    if(y<1||y>9999||m<1||m>12||d<1)return null;
    const leap=y%4===0&&(y%100!==0||y%400===0);
    if(d>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1])return null;
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function statusDate(raw) {
    const text=String(raw??'').replace(/```[\s\S]*?(?:```|$)/g,'').replace(/^\s*>.*$/gm,'')
      .replace(/<OSMedia\b[^>]*>[\s\S]*?<\/OSMedia>/gi,'');
    const match=/<StatusUI\b[^>]*>\s*([^|<\n]+)/i.exec(text);
    if(!match)return {explicit:false,date:null,time:null,place:null};
    const head=match[1].trim().replace(/\s*\([^)]*\).*$/,'').trim();
    const block=/<StatusUI\b[^>]*>([\s\S]*?)(?:<\/StatusUI>|$)/i.exec(text)?.[1]??'';
    const fields=block.split('|').map(v=>v.trim().replace(/<[^>]*>/g,''));
    return {explicit:true,date:date(head),time:fields[1]||null,place:fields[5]||null};
  }
  function entities(text) {
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>{
      if(v[0]!=='#')return named[v.toLowerCase()]??_;
      const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));
      return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):_;
    });
  }
  function plain(raw) {
    return entities(String(raw??'')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
      .replace(/<(OSMediaImages|OSImage|OSCard|OSProcessed|OSMedia|OSMediaError|OSMediaInvalid)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
      .replace(/\{\{(?:inlay|raw|image|video|audio)::[\s\S]*?\}\}/gi,'')
      .replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/<br\s*\/?>|<\/(?:p|div|section|StatusUI)>/gi,'\n').replace(/<[^>]*>/g,'')
      .replace(/ᰔ[\s\S]*?ᰔ/g,'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n')
      .replace(/\n{3,}/g,'\n\n').trim()).normalize('NFC');
  }
  function snippet(text,query) {
    const compact=text.replace(/\s+/g,' '),at=query?compact.toLowerCase().indexOf(query.toLowerCase()):0;
    const start=Math.max(0,at-48),end=Math.min(compact.length,Math.max(0,at)+112);
    return (start?'…':'')+compact.slice(start,end)+(end<compact.length?'…':'');
  }
  async function index(messages,cancel=()=>false) {
    const records=[];let current=null,clock=null,place=null;
    for(let i=0;i<messages.length;i++) {
      if(cancel())throw Error('검색을 취소했어요.');
      const m=messages[i];if(!m||typeof m.data!=='string')continue;
      const status=statusDate(m.data);if(status.explicit){current=status.date;clock=status.time;place=status.place;}
      const text=plain(m.data);
      if((m.role==='user'||m.role==='char')&&text)records.push({i,date:current,time:clock,place,text});
      if(i%200===199)await pause();
    }
    return records;
  }
  async function search(records,query,day,cancel=()=>false) {
    query=String(query??'').trim().normalize('NFC');const needle=query.toLowerCase();const hits=[];
    for(let i=0;i<records.length;i++){
      if(cancel())throw Error('검색을 취소했어요.');
      const r=records[i];if((!day||r.date===day)&&(!needle||r.text.toLowerCase().includes(needle)))hits.push({...r,preview:snippet(r.text,query)});
      if(i%200===199)await pause();
    }
    return hits;
  }
  return {date,statusDate,plain,index,search,snippet};
}

const core = createOffscriptSearchCore()
const $ = id => document.getElementById(id)
const show = (id,on) => { $(id).hidden = !on }
const setText = (id,value) => { $(id).textContent = value }
const report = message => setText('notice',message)
function guard(fn) {
    return async (...args) => { try { await fn(...args) } catch(error) { report(error.message || String(error)) } }
}
function node(tag, text, className) {
    const item = document.createElement(tag)
    if (text) item.textContent = text
    if (className) item.className = className
    return item
}
function button(label, fn, cls) {
    const item = node('button',label,cls)
    item.type='button'
    item.onclick=guard(fn)
    return item
}
document.head.insertAdjacentHTML('beforeend','<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">')
document.body.innerHTML = `<header><div class="wrap bar"><h1>📚 원문 기억</h1><button id="close" aria-label="원문 기억 닫기">닫기 ×</button></div></header>
<main class="wrap"><nav class="tabs" aria-label="원문 기억 메뉴"><button id="searchTab">🔎 검색</button><button id="pinsTab">📌 고정 <b id="count">0</b></button><button id="settingsTab">⚙️ 설정</button></nav>
<p id="notice" role="status" aria-live="polite"></p>
<section id="search"><form id="form" role="search"><div class="query"><input id="query" type="search" aria-label="원문 검색어" placeholder="대사, 인물, 장소 검색" maxlength="300"><button class="primary">검색</button></div>
<div class="filters"><label>검색 범위<select id="scope"></select></label><label>작성자<select id="role"><option value="">모두</option><option value="char">캐릭터</option><option value="user">내 입력</option></select></label><label>RP 날짜<button type="button" id="calendarOpen">🗓 전체 날짜</button></label></div></form>
<div class="meta"><strong id="summary"></strong><select id="sort" aria-label="결과 순서"><option value="new">최근 대화부터</option><option value="old">처음 대화부터</option></select></div><div id="hits"></div>
<nav id="pager" class="bar" hidden><button id="prevPage">← 이전</button><span id="page"></span><button id="nextPage">다음 →</button></nav></section>
<section id="pins" hidden><h2>📌 고정한 원문</h2><p class="sub" id="pinHelp"></p><div id="saved"></div></section>
<section id="settings" hidden><h2>⚙️ 기억 설정</h2><div id="roomSettings"><p class="sub" id="roomName"></p>
<div class="setting"><label for="parent">이전 방 이어쓰기</label><select id="parent"></select><small id="chain"></small></div>
<div class="setting"><label><input type="checkbox" id="auto"> 전개할 때 관련 원문 자동 검색</label></div>
<div class="setting"><label for="limit">한 번에 첨부할 최대 장면 수</label><select id="limit"></select><small>장면당 최대 420자. 활성 고정 원문을 목록 순서대로 먼저 담습니다.</small></div>
<h3>직전 요청에 첨부한 원문</h3><div id="sent"></div></div></section>
<section id="detail" hidden><div class="bar"><button id="back">← 목록</button><span class="detailtools"><button id="edit">✎ 원문 수정</button><button id="bookmark"></button></span></div><h2 id="title" tabindex="-1"></h2><small id="stamp"></small><details id="statusBlock" hidden><summary>상태창 원문</summary><div id="statusText"></div></details><article id="body"></article>
<textarea hidden id="draft" aria-label="메시지 원문"></textarea><div class="actions"><button id="prev">← 앞 대화</button><button id="next">뒤 대화 →</button><button id="save" class="primary" hidden>저장</button><button id="cancel" hidden>수정 취소</button></div></section>
<dialog id="calendar" aria-label="RP 날짜 선택"><div class="bar"><strong>🗓 RP 날짜</strong><button id="calClose">닫기 ×</button></div><div class="calnav"><button id="monthPrev" aria-label="이전 달">‹</button><input id="year" type="number" min="1" max="9999" aria-label="연도"><select id="month" aria-label="월"></select><button id="monthNext" aria-label="다음 달">›</button></div><div id="days"></div><small>색이 있는 날에 RP 기록이 있습니다.</small><button id="allDates">전체 날짜</button></dialog></main>`
const css = node('style')
css.textContent = `
:root{color-scheme:light;--ink:#211d20;--paper:#fffaf3;--red:#b63123;--line:#dacfc5;--muted:#695d58}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 "Inter",system-ui,sans-serif}.wrap{max-width:760px;margin:auto;padding:0 18px}header{background:#251f25;color:white;border-bottom:4px solid #fa614c}header .bar{min-height:72px}h1{font-size:25px;letter-spacing:-1.5px}h2{font-size:22px;letter-spacing:-.8px}h3{font-size:16px}.bar,.actions,.meta,.calnav{display:flex;gap:8px;align-items:center;justify-content:space-between}button,input,select,textarea{font:inherit;color:inherit}button,select,input:not([type=checkbox]),textarea{border:1px solid var(--line);border-radius:10px;background:white;padding:9px 12px;min-width:0}button,select{cursor:pointer;min-height:42px}header button{background:#393139;color:white;border-color:#62565f}.tabs{display:flex;margin:18px 0 20px;padding:4px;background:#efe7dc;border-radius:14px;gap:4px}.tabs button{flex:1;background:transparent;border:none;font-weight:700}.tabs button[aria-pressed=true]{background:#292328;color:white}.tabs b{font-size:12px}#notice{color:var(--red);margin:8px 0}#notice:empty{display:none}main{padding-bottom:45px!important}.query{display:flex;gap:7px}.query input{flex:1;height:49px;font-size:17px}.primary{background:var(--red);color:white;border-color:var(--red);font-weight:700}.filters{display:grid;grid-template-columns:1.35fr .85fr 1.2fr;gap:7px;margin:12px 0 24px}.filters label,.setting label{display:block;font-size:13px;font-weight:700}.filters select,.filters button{display:block;width:100%;margin-top:4px;padding:6px;font-size:14px}.meta{border-bottom:2px solid var(--ink);padding-bottom:8px}.meta select{border:0;background:transparent;font-size:13px}.card{border-bottom:1px solid var(--line);padding:13px 0}.openrow{display:block;text-align:left;width:100%;border:0;background:transparent;padding:0;line-height:1.55}.openrow p{margin:4px 0;overflow-wrap:anywhere}.openrow small,#stamp{color:var(--red);font-weight:650}.sub,small{color:var(--muted);font-size:13px}.actions{justify-content:flex-start;flex-wrap:wrap}.pinrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pinrow button{font-size:13px;padding:5px 10px}.setting{display:grid;gap:8px;padding:16px 0;border-bottom:1px solid var(--line)}.setting input{accent-color:var(--red)}.setting select{max-width:100%}.empty{padding:24px 8px;color:var(--muted);text-align:center}mark{background:#ffe08b;color:#211d20;border-radius:3px}#title{margin-bottom:3px}#body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;padding:16px 0 24px}textarea{width:100%;min-height:44vh;margin-top:12px}.calnav{margin-top:15px}.calnav input{width:6em}.calnav select{flex:1}dialog{width:min(380px,94vw);border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:16px;padding:18px}dialog::backdrop{background:#271b256b}#days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:15px 0}#days>*{text-align:center}#days button{border:0;padding:0;color:var(--muted);background:transparent;min-height:36px}#days .known{background:#ffdbc9;color:#812218;font-weight:750}#days .chosen{outline:2px solid var(--red)}#allDates{display:block;margin-top:12px}#pager{margin-top:18px}button:disabled{opacity:.45;cursor:default}:focus-visible{outline:3px solid #2c71a3;outline-offset:2px}[hidden]{display:none!important}@media(max-width:370px){.wrap{padding:0 10px}.filters label,.filters button,.filters select{font-size:12px}.tabs button{padding:8px 3px}}
`
css.textContent += `header{background:#18151b;border-bottom:0;background-image:linear-gradient(115deg,transparent 68%,#372432 68%,#372432 77%,#4a2d36 77%,#4a2d36 78%,transparent 78%)}header .bar{min-height:76px}h1{letter-spacing:-.085em;font-weight:900;font-size:clamp(24px,5vw,36px);margin:0}.tabs{background:transparent;border-bottom:2px solid #231c22;padding:0 0 6px;border-radius:0;gap:4px}.tabs button{border-radius:5px;letter-spacing:-.04em}.tabs button[aria-pressed=true]{background:#272128;box-shadow:inset 0 -3px #ff6148}.query{border:2px solid #241d23;border-radius:8px;box-shadow:3px 3px 0 #ef6248;background:#fff}.query input{border:0;background:transparent}.query .primary{align-self:stretch;margin:3px;border-radius:5px;background:#e8422c;color:#171116;border:0;font-weight:850;min-width:58px}.filters{margin-top:16px}.openrow small,#stamp,.calnav{font-variant-numeric:tabular-nums}.card:has(.openrow:hover){background:#fff0e4}.openrow:hover p{text-decoration:underline;text-decoration-color:#f08867;text-underline-offset:3px}.openrow{border-radius:0}.detail-date{font-weight:700}#detail{padding-top:12px}#detail #title{font-size:clamp(22px,5vw,32px);line-height:1.25;letter-spacing:-.065em;margin-top:18px}#stamp:not(:empty){display:block;margin-top:8px}#body{border-top:2px solid #242024;margin:16px 0 6px;font-size:17px;line-height:1.9;white-space:pre-wrap;word-break:normal}body:has(#detail:not([hidden])) header .bar{min-height:48px}body:has(#detail:not([hidden])) h1{font-size:19px}.pinrow [aria-pressed=true]{background:#ffdcca;border-color:#f49d7a;color:#702510}#bookmark{border-color:#de917c;color:#832315}#detail .bar{border-bottom:1px solid var(--line);padding-bottom:10px}#summary{scroll-margin-top:1rem}
`
css.textContent += '.hitrow{display:grid;grid-template-columns:minmax(0,1fr) 38px;gap:9px;align-items:center}.rowpin{padding:4px;min-height:38px;font-size:19px;background:transparent;border:0}.detailtools{display:flex;gap:6px}.rowpin:hover{background:#ffe0ce}#statusBlock{margin-top:12px;font-size:13px;color:var(--muted)}#statusText{white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 0}'
document.head.append(css)
let state, tab='search', opened, original='', returnTab, returnY=0, page=0, hits=[], day='', month, year
let indexJob, epoch=0, searchRun=0, allowed=false, saving=false
const pageSize=20
function sameSource(a,b) {
    return a.roomId===b.roomId && (a.id && b.id ? a.id===b.id : a.turn===b.turn)
}
const prefsKey = s => keyFor(s.c,s.current)
function pickTab(next) {
    tab=next
    for(const name of ['search','pins','settings','detail']) show(name,name===next)
    for(const name of ['search','pins','settings']) $(name+'Tab').setAttribute('aria-pressed',String(name===next))
    document.querySelector('.tabs').hidden=next==='detail'
    window.scrollTo(0,0)
}
function empty(id,message) { $(id).replaceChildren(node('p',message,'empty')) }
function option(select, value, name) { select.add(new Option(name,value)) }
async function checked() {
    const fresh=await story()
    if(!state || prefsKey(fresh)!==prefsKey(state)) throw Error('현재 채팅방이 바뀌었습니다. 메뉴를 다시 열어 주세요.')
    return fresh
}
let writeQueue=Promise.resolve()
function change(mutator) {
    const identity=state && prefsKey(state)
    const run=async()=>{
        if (!identity || identity!==prefsKey(state)) return
        const fresh=await checked()
        const prefs=await readPrefs(fresh.c.chaId)
        const previous=prefs[fresh.current.id] || {}
        prefs[fresh.current.id]={...previous,...mutator(previous)}
        await api.pluginStorage.setItem(prefix+fresh.c.chaId,JSON.stringify(prefs))
        state=await checked()
        controls()
        if(tab==='pins') renderPins()
        if(tab==='detail') paintBookmark()
    }
    writeQueue=writeQueue.catch(()=>{}).then(run)
    return writeQueue
}
const storedPins = p => p.pins ?? (p.pin?[p.pin]:[])
function pinChange(fn) {return change(p=>({pin:null,pins:fn(storedPins(p).slice())}))}
function pinSource(row) {
    const loc=locateSource(state.chain,row)
    if(!loc)throw Error('연결된 방에서 이 장면을 열 수 없습니다.')
    return {id:loc.room.message[loc.i].chatId || '',turn:loc.i+1,roomId:loc.room.id,roomName:loc.room.name,
        excerpt:row.excerpt && loc.body.includes(row.excerpt) ? row.excerpt.slice(0,420) : loc.body.slice(0,420)}
}
async function togglePin(row) {
    const source=pinSource(row)
    await pinChange(pins=>pins.some(p=>sameSource(p,source))?pins.filter(p=>!sameSource(p,source)):[...pins,source])
}
function controls() {
    const {current,chain,rooms}=state
    setText('count',current.pins.length)
    setText('roomName',state.c.name+' · '+current.name)
    $('auto').checked=allowed && current.sceneRecallAuto
    $('auto').disabled=!allowed
    $('limit').value=String(current.attachLimit)
    $('parent').replaceChildren(new Option('연결하지 않음',''))
    for(const r of rooms) if(r.id && !linkedRooms(r,rooms).some(x=>x.id===current.id)) option($('parent'),r.id,r.name)
    $('parent').value=current.sceneRecallParent || ''
    const cold=chain.filter(isArchivedRoom)
    setText('chain',chain.map(r=>r.name).reverse().join(' → ')+(cold.length?' · 리수에서 먼저 열어야 하는 보관된 방: '+cold.map(r=>r.name).join(', '):''))
    const scope=$('scope').value
    $('scope').replaceChildren(new Option('연결한 방 전체',''))
    for(const r of chain)option($('scope'),r.id,r.name)
    $('scope').value=chain.some(r=>r.id===scope)?scope:''
    $('sent').replaceChildren()
    for(const row of sent.get(prefsKey(state)) || [])$('sent').append(card(row,row.excerpt))
    if(!$('sent').children.length)empty('sent','이번 실행에서 첨부한 원문이 없습니다.')
}
function highlight(parent,text,query) {
    parent.textContent=''
    if(!query) {parent.textContent=text;return}
    const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    let start=0
    for(const m of text.matchAll(new RegExp(escaped,'giu'))) {
        parent.append(document.createTextNode(text.slice(start,m.index)),node('mark',m[0]))
        start=m.index+m[0].length
    }
    parent.append(document.createTextNode(text.slice(start)))
}
function metadata(r) {
    return [r.roomName,r.turn+'번',r.role==='user'?'내 입력':r.role==='char'?'캐릭터':'',r.date?.replaceAll('-','.'),r.time,r.place].filter(Boolean).join(' · ')
}
function card(row,preview,query='',available=true) {
    const box=node('div','','card')
    const open=button('',()=>openScene(row,true),'openrow')
    const line=node('p');highlight(line,preview || '(빈 장면)',query)
    open.append(node('small',metadata(row)),line);open.disabled=!available;box.append(open)
    return box
}
function renderPins() {
    const {pins,attachLimit}=state.current
    $('saved').replaceChildren()
    setText('pinHelp','사용 중 '+pins.filter(p=>p.enabled!==false).length+'개 · 위에서부터 최대 '+attachLimit+'개 첨부')
    if(!pins.length)empty('saved','검색한 장면을 열고 ‘📌 원문 고정’을 누르면 여기에 모입니다.')
    pins.forEach((p,i)=>{
        const loc=locateSource(state.chain,p)
        const resolved=loc && selectedScene({sceneRecallPin:p},state.chain)
        const box=card(resolved || p,resolved?.excerpt || p.excerpt,'',Boolean(loc))
        if(!loc)box.append(node('small','원문을 열 수 없음 · 방 연결 또는 보관 상태를 확인해 주세요.'))
        const actions=node('div','','pinrow')
        const active=button(p.enabled===false?'○ 사용 안 함':'● 사용 중',()=>pinChange(list=>list.map(x=>sameSource(x,p)?{...x,enabled:x.enabled===false}:x)))
        active.setAttribute('aria-pressed',String(p.enabled!==false))
        const up=button('↑ 우선순위',()=>pinChange(list=>{
            const n=list.findIndex(x=>sameSource(x,p))
            if(n>0)[list[n-1],list[n]]=[list[n],list[n-1]]
            return list
        }));up.disabled=i===0
        actions.append(active,up,button('고정 해제',()=>pinChange(list=>list.filter(x=>!sameSource(x,p)))))
        box.append(actions);$('saved').append(box)
    })
}
function invalidate() { epoch++;indexJob=null;searchRun++ }
function records() {
    if(indexJob)return indexJob
    const version=epoch, rooms=[...state.chain].reverse()
    indexJob=(async()=>{
        const list=[]
        for(const room of rooms){
            if(isArchivedRoom(room))continue
            const cutoff=room.message.findLastIndex(m=>m.disabled==='allBefore')
            const indexed=await core.index(room.message,()=>version!==epoch)
            for(const r of indexed) {
                if(!available(room.message,r.i,cutoff))continue
                const m=room.message[r.i]
                const rawBody=m.chatId?'':sceneBody(m.data)
                list.push({...r,role:m.role,id:m.chatId||'',turn:r.i+1,roomId:room.id,roomName:room.name,
                    excerpt:m.chatId?'':rawBody.slice(0,90)})
            }
        }
        return list
    })()
    return indexJob
}
function scoped(list) {
    return list.filter(r=>(!$('scope').value||r.roomId===$('scope').value)&&(!$('role').value||r.role===$('role').value))
}
let queryUsed=''
async function search() {
    if(!state)return
    const seq=++searchRun
    const q=$('query').value.trim().normalize('NFC')
    const list=await records()
    if(seq!==searchRun)return
    const filtered=scoped(list)
    const found=q||day?await core.search(filtered,q,day,()=>seq!==searchRun):filtered
    if(seq!==searchRun)return
    queryUsed=q;hits=found;page=0;renderPage()
}
function renderPage() {
    const n=hits.length,pages=Math.max(1,Math.ceil(n/pageSize))
    page=Math.min(page,pages-1)
    setText('summary',(queryUsed||day?'검색 결과 ':'전체 대화 ')+n.toLocaleString()+'개')
    const box=$('hits');box.replaceChildren()
    if(!n)empty('hits','일치하는 대화가 없습니다.')
    const start=page*pageSize
    for(let i=start;i<Math.min(n,start+pageSize);i++){
        const row=hits[$('sort').value==='new'?n-i-1:i]
        const item=card(row,row.preview || core.snippet(row.text,queryUsed),queryUsed)
        item.classList.add('hitrow')
        const pinned=state.current.pins.some(p=>sameSource(p,row))
        const pinButton=button(pinned?'📌':'＋',async()=>{
            const loc=locateSource(state.chain,row)
            const pos=queryUsed && loc?loc.body.toLowerCase().indexOf(queryUsed.toLowerCase()):-1
            const start=Math.max(0,pos-90)
            await togglePin({...row,excerpt:loc?.body.slice(start,start+420)||row.excerpt})
            renderPage()
        },'rowpin')
        pinButton.setAttribute('aria-label',metadata(row)+(pinned?' 고정 해제':' 원문 고정'))
        pinButton.title=pinned?'고정 해제':'원문 고정'
        item.append(pinButton);box.append(item)
    }
    setText('page',(page+1)+' / '+pages);$('prevPage').disabled=page===0;$('nextPage').disabled=page===pages-1
    show('pager',pages>1)
}
function searchNow(){search().catch(e=>{if(!e.message.includes('취소'))report(e.message)})}
function paintBookmark() {
    setText('bookmark',state.current.pins.some(p=>sameSource(p,opened))?'📌 고정 해제':'📌 원문 고정')
}
function editMode(on) {
    for(const id of ['draft','save','cancel'])show(id,on)
    for(const id of ['body','prev','next','edit','bookmark'])show(id,!on)
    $('statusBlock').style.display=on?'none':''
    $('back').disabled=on
    if(on){$('draft').value=original;$('draft').focus()}
}
function openScene(row,fromList) {
    const loc=locateSource(state.chain,row)
    if(!loc)throw Error('연결된 방에서 해당 원문을 찾을 수 없습니다.')
    if(fromList){returnTab=tab;returnY=window.scrollY}
    original=loc.room.message[loc.i].data
    const hit=queryUsed && returnTab==='search'?loc.body.toLowerCase().indexOf(queryUsed.toLowerCase()):-1
    const start=Math.max(0,hit-90)
    opened={...row,id:loc.room.message[loc.i].chatId||'',turn:loc.i+1,roomId:loc.room.id,roomName:loc.room.name,
        excerpt:hit>=0?loc.body.slice(start,start+420):row.excerpt||loc.body.slice(0,420)}
    pickTab('detail');editMode(false);paintBookmark()
    setText('title',opened.roomName+' · '+opened.turn+'번 메시지')
    const statusInfo=row.date?row:core.statusDate(original)
    setText('stamp',[statusInfo.date?.replaceAll('-','.'),statusInfo.time,statusInfo.place].filter(Boolean).join(' · '))
    const term=returnTab==='search'?queryUsed:''
    const status=original.match(/<StatusUI\b[^>]*>[\s\S]*?<\/StatusUI\s*>/i)
    const narrative=core.plain(status?original.replace(status[0],''):original)
    const separate=Boolean(status && narrative)
    show('statusBlock',separate)
    if(separate){
        const content=core.plain(status[0])
        highlight($('statusText'),content,term)
        $('statusBlock').open=Boolean(term && content.toLowerCase().includes(term.toLowerCase()) && !narrative.toLowerCase().includes(term.toLowerCase()))
    }
    highlight($('body'),narrative,term)
    $('title').focus({preventScroll:true})
    $('prev').disabled=loc.i<=0;$('next').disabled=loc.i>=loc.room.message.length-1
    window.scrollTo(0,0)
}
async function step(direction) {
    const list=(await records()).filter(r=>r.roomId===opened.roomId)
    const n=list.findIndex(r=>r.turn===opened.turn)
    if(n>=0&&list[n+direction])openScene(list[n+direction],false)
}
async function save() {
    if(saving)return
    const value=$('draft').value
    if(!value.trim())throw Error('빈 원문은 저장할 수 없습니다.')
    saving=true;$('save').disabled=$('cancel').disabled=true
    try {
        if(!await api.requestPluginPermission('dbWrite'))throw Error('리수의 저장 권한이 필요합니다.')
        const fresh=await checked()
        let ordinal=fresh.index
        if(typeof ordinal!=='number'){
            const db=await api.getDatabase(['characters'])
            ordinal=Object.keys(db?.characters||{}).findIndex(k=>db.characters[k]?.chaId===fresh.c.chaId)
        }
        if(ordinal<0)throw Error('캐릭터를 확인하지 못했습니다.')
        const c=await api.getCharacterFromIndex(ordinal)
        if(c?.chaId!==fresh.c.chaId)throw Error('캐릭터가 바뀌었습니다.')
        const i=c.chats.findIndex(r=>r.id===opened.roomId)
        if(i<0 || !fresh.chain.some(r=>r.id===opened.roomId))throw Error('방 연결이 바뀌었습니다.')
        const room=await api.getChatFromIndex(ordinal,i)
        const loc=room && locateSource([room],opened)
        if(!loc||room.isStreaming||room.message[loc.i].data!==original)throw Error('원문이 바뀌었거나 전개 중입니다. 다시 열어 주세요.')
        const old=opened, id=room.message[loc.i].chatId || 'scene-'+Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')
        room.message[loc.i]={...room.message[loc.i],chatId:id,data:value}
        await api.setChatToIndex(ordinal,i,room)
        state=await checked();invalidate()
        const updated={...old,id,excerpt:sceneBody(value).slice(0,420)}
        const result=locateSource(state.chain,updated)
        if(!result||result.room.message[result.i].data!==value)throw Error('저장 결과를 확인할 수 없습니다.')
        if(state.current.pins.some(p=>sameSource(p,old)))await pinChange(list=>list.map(p=>sameSource(p,old)?{...p,id:updated.id,turn:updated.turn,excerpt:updated.excerpt}:p))
        openScene(updated,false);await search();report('원문을 저장했습니다.')
    }finally{saving=false;$('save').disabled=$('cancel').disabled=false}
}
async function calendar() {
    const known=new Set(scoped(await records()).map(r=>r.date).filter(Boolean))
    $('year').value=year;$('month').value=month
    const grid=$('days');grid.replaceChildren()
    for(const w of '일월화수목금토')grid.append(node('small',w))
    const first=new Date(0);first.setUTCFullYear(year,month-1,1)
    for(let i=0;i<first.getUTCDay();i++)grid.append(node('span'))
    for(let n=1;n<=31;n++) {
        const iso=core.date(String(year).padStart(4,'0')+'-'+month+'-'+n)
        if(!iso)break
        const b=button(String(n),()=>chooseDay(iso))
        b.setAttribute('aria-label',iso)
        if(known.has(iso))b.classList.add('known')
        if(day===iso)b.classList.add('chosen')
        grid.append(b)
    }
}
function chooseDay(iso) {
    day=iso;setText('calendarOpen',day?day.replaceAll('-','.'):'🗓 전체 날짜')
    $('calendar').close();searchNow()
}
function moveMonth(delta) {
    const total=(year-1)*12+month-1+delta
    if(total<0 || total>=9999*12)return
    year=Math.floor(total/12)+1;month=total%12+1
    return calendar()
}
async function toTab(next) {
    pickTab(next);report('')
    if(!state){report('채팅방을 열면 해당 소설의 검색과 고정 목록을 사용할 수 있습니다.');return}
    if(next==='search')await search()
    if(next==='pins')renderPins()
    if(next==='settings'){controls();if(!allowed)report('자동 첨부에는 리수의 대화 내용 변경 권한이 필요합니다.')}
}
for(const name of ['search','pins','settings'])$(name+'Tab').onclick=guard(()=>toTab(name))
for(let n=1;n<=8;n++)option($('limit'),String(n),n+'개')
for(let n=1;n<=12;n++)option($('month'),String(n),n+'월')
$('form').onsubmit=e=>{e.preventDefault();searchNow()}
let timer
$('query').oninput=e=>{if(e.isComposing)return;clearTimeout(timer);timer=setTimeout(searchNow,180)}
$('query').oncompositionend=()=>{clearTimeout(timer);timer=setTimeout(searchNow,100)}
$('scope').onchange=$('role').onchange=searchNow
$('sort').onchange=()=>{page=0;renderPage()}
for(const [id,delta] of [['prevPage',-1],['nextPage',1]])$(id).onclick=()=>{page+=delta;renderPage();$('summary').scrollIntoView({block:'start'})}
$('calendarOpen').onclick=guard(async()=>{
    const list=scoped(await records())
    const latest=day||list.findLast(r=>r.date)?.date
    const now=new Date()
    ;[year,month]=latest?latest.split('-').map(Number):[now.getFullYear(),now.getMonth()+1]
    await calendar();$('calendar').showModal()
})
$('calClose').onclick=()=>$('calendar').close()
$('allDates').onclick=()=>chooseDay('')
$('monthPrev').onclick=guard(()=>moveMonth(-1));$('monthNext').onclick=guard(()=>moveMonth(1))
$('year').onchange=$('month').onchange=guard(async()=>{
    const val=Number($('year').value)
    if(!Number.isInteger(val)||val<1||val>9999)return
    year=val;month=Number($('month').value);await calendar()
})
$('parent').onchange=guard(async()=>{const parent=$('parent').value;await change(()=>({parent}));invalidate();await search()})
$('auto').onchange=guard(()=>{const auto=$('auto').checked;return change(()=>({auto}))})
$('limit').onchange=guard(()=>{const limit=Number($('limit').value);return change(()=>({limit}))})
$('bookmark').onclick=guard(()=>togglePin(opened))
$('back').onclick=guard(async()=>{
    pickTab(returnTab);report('')
    if(returnTab==='pins')renderPins()
    if(returnTab==='settings')controls()
    window.scrollTo(0,returnY)
})
$('edit').onclick=()=>editMode(true)
$('cancel').onclick=()=>editMode(false)
$('save').onclick=guard(save)
$('prev').onclick=guard(()=>step(-1));$('next').onclick=guard(()=>step(1))
$('close').onclick=guard(async()=>{
    if(saving)return
    if(tab==='detail'&&!$('draft').hidden && $('draft').value!==original) {
        report('수정 중입니다. 저장하거나 수정 취소를 눌러 주세요.');return
    }
    clearTimeout(timer);invalidate();await api.hideContainer()
})
async function open(initial) {
    if(saving)return
    await api.showContainer('fullscreen')
    invalidate();day='';page=0;hits=[];queryUsed='';opened=null;state=null
    $('query').value='';$('role').value='';$('sort').value='new'
    $('scope').replaceChildren();$('saved').replaceChildren();$('hits').replaceChildren()
    setText('calendarOpen','🗓 전체 날짜');setText('count',0)
    show('roomSettings',false);pickTab(initial);report('')
    try{state=await story()}catch(e){report('소설의 채팅방을 열어 주세요. 방마다 검색 범위와 고정 목록을 따로 관리합니다.');return}
    show('roomSettings',true);controls();await toTab(initial)
}
await api.registerSetting('원문 기억 설정',guard(()=>open('settings')),'📚','html','pocket-original-settings')
await api.registerButton({name:'원문 기억 설정',location:'hamburger',icon:'📚',iconType:'html',id:'pocket-original-menu'},guard(()=>open('settings')))
await api.registerButton({name:'원문 기억',location:'chat',icon:'🔎',iconType:'html',id:'pocket-original-search'},guard(()=>open('search')))
await api.addRisuReplacer('beforeRequest',before)
allowed=await api.requestPluginPermission('replacer')
})().catch(error=>console.error('원문 기억',error))
