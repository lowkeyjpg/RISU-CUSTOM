import type { Chat, Message } from '../../storage/database.svelte'
import type { OpenAIChat } from '../index.svelte'

export interface SceneSource {
    id: string
    turn: number
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
export function searchScenes(messages: Message[], query: string, end = messages.length, limit = 20): SceneHit[] {
    const terms = queryTerms(query)
    if (!terms.length) return []
    const endIndex = Math.min(end, messages.length)
    const cutoff = messages.findLastIndex(m => m.disabled === 'allBefore')
    const hits: SceneHit[] = []
    for (let i = cutoff + 1; i < endIndex; i++) {
        if (!available(messages, i, cutoff)) continue
        const body = sceneBody(messages[i].data)
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

export function selectedScene(chat: Chat): SceneSource | undefined {
    const pin = chat.sceneRecallPin
    if (!pin) return
    const i = chat.message.findIndex(m => m.chatId === pin.id)
    const cutoff = chat.message.findLastIndex(m => m.disabled === 'allBefore')
    if (i < 0 || !available(chat.message, i, cutoff)) return
    const body = sceneBody(chat.message[i].data)
    // After an edit, never quote the obsolete saved excerpt.
    if (body.includes(pin.excerpt) && pin.excerpt) return { ...pin, turn: i + 1 }
    const excerpt = body.slice(0, 420).trim()
    if (excerpt) return { id: pin.id, turn: i + 1, excerpt }
}

export function recallForRequest(chat: Chat, prompt: OpenAIChat[]): SceneSource[] {
    const pin = selectedScene(chat)
    if (pin) return [pin]
    if (chat.sceneRecallAuto === false) return []
    const lastUser = chat.message.findLastIndex(m => m.role === 'user' && !m.disabled && !m.isComment)
    if (lastUser < 3 || chat.message.slice(lastUser).some(m => m.disabled === 'allBefore')) return []
    const query = sceneBody(chat.message[lastUser].data).slice(-800)
    const present = new Set(prompt.map(m => m.memo))
    const sources = searchScenes(chat.message, query, lastUser - 2, chat.message.length)
        .filter(hit => hit.id && (hit.matches >= 2 || hit.score >= 3)
            && !present.has(hit.id) && !prompt.some(m => m.content.includes(hit.excerpt)))
    return sources.slice(0, 2).map(({ id, turn, excerpt }) => ({ id, turn, excerpt }))
}

export function scenePrompt(sources: SceneSource[]): OpenAIChat {
    return {
        role: 'user',
        content: 'Earlier scene excerpts from this same story, provided as historical context. Keep subsequent developments in effect.\n'
            + JSON.stringify(sources.map(({ turn, excerpt }) => ({ turn, excerpt }))),
    }
}
