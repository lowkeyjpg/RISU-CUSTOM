import type { Chat, Message } from '../../storage/database.svelte'
import type { OpenAIChat } from '../index.svelte'

export interface SceneSource {
    id: string
    turn: number
    roomId?: string
    roomName?: string
    excerpt: string
}
export interface SceneHit extends SceneSource {
    score: number
    matches: number
    role: Message['role']
}

const noise = new Set('그때 그거 전에 예전 예전에 지난 장면 뭐라고 어떻게 다시 관련 대해 했던 기억 그녀 그는 그리고 그냥 대체 이번 그가 함께 있었다 what when where which with were that have then about they from said'.split(' '))
const families = [
    ['약속', '맹세', '서약', '하기로', 'promise', 'vow'],
    ['비밀', '발설', '누설', '함구', 'secret'],
    ['배신', '배반', 'betray'],
    ['화해', '사과', '용서', 'forgive', 'apolog'],
    ['이별', '결별', '헤어지', 'breakup'],
]
function queryTerms(query: string): string[][] {
    const words = query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
    const terms = new Map<string, string[]>()
    for (const word of words) {
        if (word.length < 2 || noise.has(word)) continue
        const family = families.find(group => group.some(term => word.startsWith(term)))
        const stem = word.replace(/(에게서는|에게서|에서는|한테서|에게|한테|으로|에서|하고|했던|처럼|까지|께서|이랑|이라도|에는|은|는|이|가|을|를|와|과|에|의|도)$/u, '')
        const term = family?.[0] ?? (stem.length >= 2 ? stem : word)
        if (!noise.has(term)) terms.set(term, family ?? [term])
    }
    return Array.from(terms.values()).slice(0, 32)
}

function sceneBody(raw: string): string {
    return raw.replace(/<(thoughts?|style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
        .replace(/\{\{[^{}]*\}\}/g, '').replace(/<[^>\n]*>/g, ' ')
        .replace(/data:[\w/+.-]+;base64,[a-z\d+/=]+/gi, '').trim()
}

function available(messages: Message[], index: number, cutoff: number) {
    const message = messages[index]
    return index > cutoff && !message.disabled && !message.isComment && typeof message.data === 'string'
        && !message.data.startsWith('\uEF01COLDSTORAGE\uEF01')
}

// Work on overlapping passages so a long turn can be found by a line near its end.
export function searchScenes(messages: Message[], query: string, end = messages.length, limit = 20, literal = ''): SceneHit[] {
    const terms = queryTerms(query)
    if (!terms.length && !literal) return []
    const endIndex = Math.min(end, messages.length)
    const cutoff = messages.findLastIndex(m => m.disabled === 'allBefore')
    const hits: SceneHit[] = []
    for (let i = cutoff + 1; i < endIndex; i++) {
        if (!available(messages, i, cutoff)) continue
        const body = sceneBody(messages[i].data)
        // Direct matches take precedence when a reader searches for a line, even for a single character.
        const pos = literal ? body.toLowerCase().indexOf(literal) : -1
        if (pos >= 0) {
            const start = Math.max(0, pos - 100)
            hits.push({ id: messages[i].chatId ?? '', turn: i + 1, role: messages[i].role, score: Number.MAX_SAFE_INTEGER,
                matches: 1, excerpt: body.slice(start, Math.max(start + 420, pos + literal.length)) })
            continue
        }
        let best: SceneHit | undefined
        for (let start = 0; start < body.length; start += 320) {
            const excerpt = body.slice(start, start + 420).trim()
            const text = excerpt.normalize('NFKC').toLowerCase()
            let matches = 0, score = 0
            for (const group of terms) {
                if (group.some(term => text.includes(term))) {
                    matches++
                    score += group.length > 1 ? 4 : 1 + Math.min(4, group[0].length) / 2
                }
            }
            if (!matches || (best && best.score >= score)) continue
            best = { id: messages[i].chatId ?? '', turn: i + 1, excerpt, role: messages[i].role, score, matches }
        }
        if (best) hits.push(best)
    }
    return hits.sort((a, b) => b.score - a.score || b.turn - a.turn).slice(0, limit)
}

// Links are scoped to one character. Follow only the explicitly chosen ancestry.
export function linkedRooms(chat: Chat, siblings: Chat[]): Chat[] {
    const byId = new Map(siblings.filter(room => room.id).map(room => [room.id, room]))
    const rooms = [chat]
    const seen = new Set([chat.id])
    let parent = chat.sceneRecallParent
    while (parent && !seen.has(parent)) {
        const room = byId.get(parent)
        if (!room) break
        rooms.push(room)
        seen.add(parent)
        parent = room.sceneRecallParent
    }
    return rooms
}

const coldHeader = '\uEF01COLDSTORAGE\uEF01'
export function isArchivedRoom(room: Chat) {
    return room.message[0]?.data?.startsWith(coldHeader)
}

// Read archived rooms without changing the stored pointer or restoring their Hypa data.
export async function readSceneRooms(rooms: Chat[], read: (key: string) => Promise<unknown>): Promise<Chat[]> {
    return Promise.all(rooms.map(async room => {
        if (!isArchivedRoom(room)) return room
        try {
            const data = await read(room.message[0].data.slice(coldHeader.length))
            const messages = Array.isArray(data) ? data : (data as { message?: Message[] } | null)?.message
            if (Array.isArray(messages) && messages.every(m => m && typeof m.data === 'string')) {
                return { ...room, message: messages }
            }
        } catch { /* Keep the pointer for a later retry and show the room as unavailable. */ }
        return room
    }))
}

export function searchRooms(rooms: Chat[], query: string, currentEnd = rooms[0].message.length, limit = 20, literal = ''): SceneHit[] {
    const hits = rooms.flatMap((room, i) => searchScenes(room.message, query, i ? room.message.length : currentEnd, limit, literal)
        .map(hit => ({ ...hit, roomId: room.id, roomName: room.name })))
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

type SourceLocation = { id: string, roomId?: string, turn?: number, excerpt: string }
export function locateSource(rooms: Chat[], source: SourceLocation) {
    const room = source.roomId ? rooms.find(r => r.id === source.roomId) : rooms[0]
    if (!room) return
    const turnIndex = (source.turn ?? 0) - 1
    const i = !source.id || room.message[turnIndex]?.chatId === source.id
        ? turnIndex : room.message.findIndex(m => m.chatId === source.id)
    if (i < 0 || i >= room.message.length || !available(room.message, i, room.message.findLastIndex(m => m.disabled === 'allBefore'))) return
    const body = sceneBody(room.message[i].data)
    if (!source.id && !body.includes(source.excerpt)) return
    return { room, i, body }
}

export function selectedScene(chat: Chat, rooms = [chat]): SceneSource | undefined {
    const pin = chat.sceneRecallPin
    if (!pin) return
    const location = locateSource(rooms, pin)
    if (!location) return
    const { room, i, body } = location
    const excerpt = pin.excerpt && body.includes(pin.excerpt) ? pin.excerpt : body.slice(0, 420).trim()
    if (excerpt) return { id: pin.id, ...(pin.roomId ? { roomId:room.id, roomName:room.name } : {}), turn:i + 1, excerpt }
}

export function recallForRequest(chat: Chat, prompt: OpenAIChat[], rooms = [chat]): SceneSource[] {
    const pin = selectedScene(chat, rooms)
    if (pin) return [pin]
    if (chat.sceneRecallAuto === false) return []
    const lastUser = chat.message.findLastIndex(m => m.role === 'user' && !m.disabled && !m.isComment)
    if (lastUser < 0 || chat.message.slice(lastUser).some(m => m.disabled === 'allBefore')) return []
    const query = sceneBody(chat.message[lastUser].data).slice(-800)
    const present = new Set(prompt.map(m => m.memo))
    const seen = new Set<string>()
    const sources: SceneSource[] = []
    for (const hit of searchRooms(rooms, query, Math.max(0, lastUser - 2), Infinity)) {
        if (hit.matches < 2 && hit.score < 3) continue
        if (hit.roomId === chat.id && hit.id && present.has(hit.id)) continue
        if (seen.has(hit.excerpt) || prompt.some(m => m.content.includes(hit.excerpt))) continue
        const { id, turn, excerpt, roomId, roomName } = hit
        sources.push({ id, turn, excerpt, roomId, roomName })
        seen.add(excerpt)
        if (sources.length === 2) break
    }
    return sources
}

export function scenePrompt(sources: SceneSource[]): OpenAIChat {
    return {
        role: 'user',
        content: 'Earlier scene excerpts from this same story, provided as historical context. Keep subsequent developments in effect.\n'
            + JSON.stringify(sources.map(({ roomName, turn, excerpt }) => ({ room: roomName, turn, excerpt }))),
    }
}
