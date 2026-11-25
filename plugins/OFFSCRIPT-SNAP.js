//@name offscript_snap
//@display-name 📸 OFFSCRIPT · SNAP
//@api 3.0
//@version 1.0.0
(async () => {
'use strict'
const api = globalThis.Risuai || globalThis.risuai
const el = id => document.getElementById(id)
const node = (tag, text) => Object.assign(document.createElement(tag), {textContent:text ?? ''})
const option = (value, label) => new Option(label,value)
const trim = value => String(value || '').trim()
const entities = s => s.replace(/&(lt|gt|amp|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,(all,v)=>{
    const names={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '}
    if (v[0]!=='#') return names[v.toLowerCase()] ?? all
    const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))
    return n>0 && n<=0x10ffff ? String.fromCodePoint(n):all
})
function plain(s) {
    return trim(s.replace(/<(script|style|thoughts?|OSMedia)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'')
        .replace(/<br\s*\/?>|<\/p>/gi,'\n').replace(/<[^>\n]+>/g,'').replace(/\{\{[^{}]*\}\}/g,'').replace(/[ \t]+/g,' '))
}
function parseScene(raw) {
    const decoded=entities(entities(raw))
    const status=/<StatusUI\b[^>]*>([\s\S]*?)(?:<\/StatusUI\s*>|$)/i.exec(decoded)
    const fields=status ? status[1].split('|').map(plain):[]
    const people=new Map()
    for (const [i,field] of fields.slice(6).entries()) {
        for (const m of field.matchAll(/\[([^\]\n]{1,60})\]\s*([^\[]*)/g)) {
            const name=trim(m[1]), value=trim(m[2])
            if(!name || !value)continue
            const person=people.get(name) || {name,look:[],mood:[],action:[]}
            const bucket=[person.look,person.mood,person.action][i%3]
            if(!bucket.includes(value))bucket.push(value)
            people.set(name,person)
        }
    }
    const body=plain(status?decoded.slice(0,status.index)+'\n'+decoded.slice(status.index+status[0].length):decoded)
    return {when:fields.slice(0,5).filter(Boolean).join(' · '),where:fields[5]||'',people,body}
}
// Suggest only phrases literally present in this scene. Any other prop can be selected from the text.
const commonProps=['다이어트 콜라 캔','밀크셰이크 빨대','밀크셰이크','샴페인 잔','음료 캔','콜라 캔','소다 캔','수첩','폴라로이드','카세트테이프','카세트 플레이어','워크맨','책가방','손거울','깃펜','지팡이','손목시계','목걸이','브로치','열쇠','편지 봉투','봉투','만년필','라이터','머리띠','사물함','공책','안경','전화기','사진첩','신문','티켓','초대장','카메라','쪽지','샐러드 접시']
const modes=[['one','단독샷',1],['two','투샷',2],['three','쓰리샷',3],['many','직접 선택',Infinity],['all','전원 단체샷',Infinity],['props','사물만',0]]
const framings=['자동','클로즈업','상반신','전신','전체샷 · 배경까지 넓게']
const refs = new Map()
let scenes=[], scene, charKey='', selected=[], objects=[], suggestions=[], mode='one', composing=false, opening=0
function note(s){el('notice').textContent=s}
function guard(fn){return async(...args)=>{try{await fn(...args)}catch(e){note(e.message||String(e))}}}
function button(label,click,active=false){
    const b=node('button',label);b.type='button';b.setAttribute('aria-pressed',String(active));b.onclick=guard(click);return b
}
document.head.insertAdjacentHTML('beforeend','<meta name="viewport" content="width=device-width,initial-scale=1">')
document.body.innerHTML=`<main><header><div><span>OFFSCRIPT</span><h1>SNAP</h1></div><button id="close">닫기 ×</button></header>
<label>RP 장면<select id="scene"></select></label>
<section><h2>출연</h2><div id="modes" class="strip"></div><div id="people" class="chips"></div>
<details id="extraPerson"><summary>인물 직접 추가</summary><div class="line"><input id="newPerson" aria-label="인물 이름"><button id="addPerson">추가</button></div></details></section>
<section><h2>사물</h2><div id="props" class="chips"></div><div class="line"><input id="newProp" placeholder="예: 슬론이 든 콜라 캔" aria-label="사물 이름"><button id="addProp">추가</button></div>
<details id="excerpt"><summary>원문에서 사물 고르기</summary><p id="original"></p><button id="pickSelection">선택한 문구 추가</button></details></section>
<section><div class="cols"><label>촬영 범위<select id="frame"></select></label><label>화면 비율<select id="ratio"></select></label></div>
<label>추가 연출<input id="direction" placeholder="예: 분수대에 기대 선 세 사람, 눈높이에서"></label></section>
<section id="refSection"><h2>얼굴 레퍼런스</h2><div id="faces"></div></section>
<section><h2>이미지 요청문</h2><textarea id="prompt" aria-label="이미지 요청문" rows="8"></textarea><button class="primary" id="copy">요청문 복사</button></section><p role="status" id="notice"></p></main>`
const style=node('style',`
:root{color-scheme:light;--bg:#eeede7;--card:#faf9f4;--ink:#1b1b1b;--blue:#2543ef;--line:#c8c7bd}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}main{max-width:720px;padding:16px clamp(14px,4vw,32px) 28px;margin:auto}header,.line,.cols{display:flex;align-items:center;gap:8px}header{align-items:start;justify-content:space-between;border-bottom:2px solid var(--ink);margin-bottom:14px}header span{font:bold 12px Arial,sans-serif;letter-spacing:.16em}h1{font:900 clamp(50px,10vw,76px)/.9 Arial,sans-serif;letter-spacing:-.075em;margin:4px 0 12px}h2{font-size:16px;margin:0 0 9px}section{border-bottom:1px solid var(--line);padding:14px 0}label{display:block;font-size:14px;font-weight:650}button,input,select,textarea{font:inherit;color:inherit;border:1px solid var(--line);background:var(--card);border-radius:3px;padding:7px 9px;min-width:0}button{min-height:38px;cursor:pointer}button:disabled{opacity:.5}button[aria-pressed=true],.primary{background:var(--blue);color:#fff;border-color:var(--blue)}header button{background:transparent;border:0}.chips,.strip{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.strip button{font-size:14px}.chips button{border-radius:18px}.cols>*,.line input{flex:1;min-width:0}.cols{margin-bottom:10px}label input,select,textarea{width:100%}select,input{min-height:40px}summary{cursor:pointer;color:#424553;font-size:14px;padding:5px 0}#original{white-space:pre-wrap;max-height:32vh;overflow:auto;user-select:text;background:var(--card);padding:12px}small{display:block;color:#565650}.ref{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}.ref strong{margin-right:auto;font-size:14px}.ref img{width:56px;height:64px;object-fit:cover}.ref a{color:var(--blue);font-size:14px}.primary{width:100%;font-weight:bold}textarea{line-height:1.65}#notice{position:sticky;bottom:8px;background:var(--ink);color:white;padding:8px 12px}#notice:empty,[hidden]{display:none!important}
`);document.head.append(style)
for(const v of framings)el('frame').add(option(v,v))
for(const v of ['자동','3:4','2:3','1:1','4:3','16:9','9:16'])el('ratio').add(option(v,v))
function capacity(){return modes.find(m=>m[0]===mode)[2]}
function setMode(next){
    mode=next
    if(next==='all')selected=[...scene.people.keys()]
    else selected=selected.slice(0,capacity())
    render()
}
function togglePerson(name) {
    if(mode==='all')mode='many'
    if(mode==='props')mode='one'
    const pos=selected.indexOf(name)
    if(pos>=0)selected.splice(pos,1)
    else if(capacity()===1)selected=[name]
    else if(selected.length<capacity())selected.push(name)
    else {note('선택한 인물 한 명을 먼저 해제해 주세요.');return}
    render()
}
function changeScene() {
    if(!scenes.length)return
    scene=parseScene(scenes[Number(el('scene').value)].raw)
    selected=[...scene.people.keys()].slice(0,1);objects=[];mode='one'
    const source=[scene.body,...[...scene.people.values()].flatMap(p=>[...p.action,...p.look])].join('\n')
    suggestions=commonProps.filter((p,i)=>source.includes(p)&&!commonProps.slice(0,i).some(q=>q.includes(p)&&source.includes(q)))
    el('original').textContent=source
    el('direction').value='';el('newProp').value='';el('newPerson').value=''
    el('extraPerson').open=!scene.people.size;el('excerpt').open=false;render()
}
function addObject(value){
    value=trim(value)
    if(!value)return
    if(value.length>180){note('사물이나 묘사 한 구절을 180자 안으로 골라 주세요.');return}
    if(!suggestions.includes(value))suggestions.push(value)
    if(!objects.includes(value))objects.push(value)
    el('newProp').value='';render()
}
function makePrompt() {
    const cap=capacity()
    const needed=Number.isFinite(cap) && cap>0? cap:1
    const ready=mode==='props'?objects.length>0:selected.length>=needed
    el('copy').disabled=!ready
    const output=el('prompt')
    if(!ready){output.value='';output.placeholder=mode==='props'?'사물을 골라 주세요.':needed+'명의 인물을 골라 주세요.';return}
    const lines=[]
    const named=selected.join(', ')
    if(mode==='props')lines.push('사물 사진. 인물이나 손은 화면에 나오지 않게.')
    else {
        const type=({1:'단독샷',2:'투샷',3:'쓰리샷'})[selected.length]||'단체샷'
        lines.push(named+' '+type+'. 화면에 등장하는 인물은 이 '+selected.length+'명으로 한정.')
    }
    if(scene.when)lines.push('장면 시점 · '+scene.when)
    if(scene.where)lines.push('장소 · '+scene.where)
    for(const name of selected){
        const p=scene.people.get(name)
        lines.push([name,...p.look,...p.mood,...p.action].join(' · '))
        if(refs.get(refKey(name)))lines.push(name+'의 얼굴과 그림체는 함께 첨부한 해당 인물의 레퍼런스를 기준으로 유지.')
    }
    if(objects.length)lines.push((mode==='props'?'피사체 · ':'화면에 포함할 사물 · ')+objects.join(', '))
    if(el('frame').value!=='자동')lines.push('프레이밍 · '+el('frame').value)
    if(el('ratio').value!=='자동')lines.push('화면 비율 · '+el('ratio').value)
    if(trim(el('direction').value))lines.push(trim(el('direction').value))
    output.value=lines.join('\n')
}
function refKey(name){return 'offscript.snap.reference.'+JSON.stringify([charKey,name])}
let faceVersion=0
async function drawFaces(){
    const v=++faceVersion, names=[...selected], area=el('faces')
    area.replaceChildren();el('refSection').hidden=!names.length
    for(const name of names){
        const key=refKey(name)
        if(!refs.has(key)){
            const data=await api.pluginStorage.getItem(key)
            if(v!==faceVersion)return
            refs.set(key,data||null)
        }
        if(v!==faceVersion)return
        const data=refs.get(key), row=node('div');row.className='ref'
        row.append(node('strong',name))
        if(data){
            const img=node('img');img.alt=name+' 얼굴 레퍼런스';img.src=data.url;row.append(img)
            const a=node('a','이미지 저장');a.href=data.url;a.download=data.file;row.append(a)
            row.append(button('해제',async()=>{await api.pluginStorage.removeItem(key);refs.delete(key);render()}))
        }
        const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true
        row.append(file,button(data?'교체':'사진 등록',()=>file.click()))
        file.onchange=guard(async()=>{
            const f=file.files[0];if(!f)return
            if(!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('JPG, PNG 또는 WebP 사진을 선택해 주세요.')
            if(f.size>16*1024*1024)throw Error('16MB 이하의 레퍼런스 사진을 선택해 주세요.')
            const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));r.readAsDataURL(f)})
            const data={url,file:f.name}
            await api.pluginStorage.setItem(key,data)
            refs.set(key,data);render()
        })
        area.append(row)
    }
    if(v===faceVersion && !composing)makePrompt()
}
function render() {
    note('');composing=false
    el('modes').replaceChildren(...modes.map(([id,label])=>button(label,()=>setMode(id),mode===id)))
    const people=el('people');people.replaceChildren()
    if(mode!=='props')for(const name of scene.people.keys())people.append(button(name,()=>togglePerson(name),selected.includes(name)))
    el('extraPerson').hidden=mode==='props'
    const props=el('props');props.replaceChildren(...suggestions.map(p=>button(p,()=>{
        if(objects.includes(p))objects=objects.filter(x=>x!==p);else objects.push(p)
        render()
    },objects.includes(p))))
    makePrompt();drawFaces().catch(e=>note('레퍼런스를 불러오지 못했습니다. '+e.message))
}
el('addPerson').onclick=()=>{
    const name=trim(el('newPerson').value);if(!name)return
    if(!scene.people.has(name))scene.people.set(name,{name,look:[],mood:[],action:[]})
    if(mode==='all'){selected=[...scene.people.keys()];render()}
    else if(!selected.includes(name))togglePerson(name)
    el('newPerson').value=''
}
el('addProp').onclick=()=>addObject(el('newProp').value)
el('pickSelection').onmousedown=e=>e.preventDefault()
let marked=''
document.addEventListener('selectionchange',()=>{
    const sel=window.getSelection()
    if(sel && el('original').contains(sel.anchorNode)&&el('original').contains(sel.focusNode)&&sel.toString().trim())marked=sel.toString()
})
el('pickSelection').onclick=()=>{if(marked)addObject(marked);else note('위 원문에서 사물 이름을 길게 눌러 선택해 주세요.')}
el('scene').onchange=()=>{marked='';changeScene()}
for(const id of ['frame','ratio','direction'])el(id).oninput=()=>{composing=false;makePrompt()}
el('prompt').oninput=()=>{composing=true;el('copy').disabled=!trim(el('prompt').value)}
el('copy').onclick=guard(async()=>{
    const output=el('prompt')
    output.focus();output.select();output.setSelectionRange(0,output.value.length)
    let copied=false
    try{copied=document.execCommand('copy')}catch{}
    if(!copied)try{await navigator.clipboard.writeText(output.value);copied=true}catch{}
    note(copied?'요청문을 복사했습니다.':'요청문을 선택했습니다. 길게 눌러 복사해 주세요.')
})
el('close').onclick=guard(()=>api.hideContainer())
function labelFor(raw,i){
    const block=raw.match(/(?:<|&lt;)StatusUI\b[^|]{0,40}?(\d{4}[./-]\d{1,2}[./-]\d{1,2}[^|]{0,12})\|\s*([^|]{1,24})/i)
    return (i+1)+'번 · '+(block?trim(block[1])+' '+trim(block[2]):plain(entities(raw.slice(0,180))).replace(/\s+/g,' ').slice(0,48)||'RP')
}
async function open(){
    const version=++opening;marked='';scene=null;scenes=[];selected=[];faceVersion++
    await api.showContainer('fullscreen');note('장면을 불러오는 중…')
    const c=await api.getCharacter()
    if(version!==opening)return
    charKey=c?.chaId
    const chat=c?.chats?.[c.chatPage]
    for(const section of document.querySelectorAll('main>section'))section.hidden=true
    el('scene').replaceChildren();el('original').textContent='';el('prompt').value=''
    if(!charKey||!Array.isArray(chat?.message)){note('SNAP을 사용할 채팅방을 먼저 열어 주세요.');return}
    for(let i=chat.message.length-1;i>=0;i--){
        const m=chat.message[i]
        if(m?.role!=='char'||m.isComment||typeof m.data!=='string'||!m.data.trim()||m.data.startsWith('\uEF01COLDSTORAGE\uEF01'))continue
        scenes.push({i,raw:m.data})
        el('scene').add(option(String(scenes.length-1),labelFor(m.data,i)))
    }
    if(!scenes.length){note('아직 이 방에 선택할 RP 답변이 없습니다.');return}
    for(const section of document.querySelectorAll('main>section'))section.hidden=false
    changeScene();window.scrollTo(0,0)
}
await api.registerButton({name:'OFFSCRIPT · SNAP',location:'chat',icon:'📸',iconType:'html',id:'offscript-snap-chat'},guard(open))
await api.registerButton({name:'OFFSCRIPT · SNAP',location:'action',icon:'📸',iconType:'html',id:'offscript-snap-action'},guard(open))
})().catch(e=>console.error('SNAP',e))
