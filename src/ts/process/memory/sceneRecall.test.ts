import { describe, expect, it } from 'vitest'
import type { Chat, Message } from '../../storage/database.svelte'
import { linkedRooms, readSceneRooms, recallForRequest, searchScenes, searchRooms, selectedScene, locateSource } from './sceneRecall'

function story(): Chat {
    const lines = ['슬론에게 파란 봉투를 맡기겠다고 맹세했다.', '꽃이 피었다.', '등불이 꺼졌다.', '문이 닫혔다.', '길을 걸었다.', '그때 슬론과 한 약속은 뭐였지?']
    const message: Message[] = lines.map((data, i) => ({ data, role: i % 2 ? 'user' : 'char', chatId: String(i) }))
    return { message } as Chat
}
describe('original scene recall', () => {
    it('retrieves the old promise from the latest Korean question', () => {
        expect(recallForRequest(story(), []).map(s => s.id)).toEqual(['0'])
    })
    it('skips a source already retained or when automatic recall is off', () => {
        const chat = story()
        expect(recallForRequest(chat, [{ role: 'assistant', memo: '0', content: chat.message[0].data }])).toEqual([])
        chat.sceneRecallAuto = false
        expect(recallForRequest(chat, [])).toEqual([])
    })
    it('finds the relevant passage deep in a long turn', () => {
        const chat = story()
        chat.message[0].data = '그는 한참 동안 거리를 걸었다. '.repeat(80) + '라일락 향수는 비밀이었다.'
        expect(searchScenes(chat.message, '라일락')[0].excerpt).toContain('라일락 향수는 비밀이었다.')
    })
    it('honors disabled history and ignores deleted pins or comments', () => {
        const chat = story()
        chat.sceneRecallPin = { id: '0', excerpt: chat.message[0].data }
        chat.message[1].disabled = 'allBefore'
        expect(searchScenes(chat.message,'파란')).toEqual([])
        expect(selectedScene(chat)).toBeUndefined()
        chat.message[1].disabled = undefined
        chat.message[0].isComment = true
        expect(selectedScene(chat)).toBeUndefined()
        chat.message.shift()
        expect(selectedScene(chat)).toBeUndefined()
    })
    it('gives an explicit pin precedence and quotes edited text', () => {
        const chat = story()
        chat.sceneRecallAuto = false
        chat.sceneRecallPin = { id: '0', excerpt: chat.message[0].data }
        chat.message[0].data = '봉투는 빨간색이었다.'
        expect(recallForRequest(chat, [])).toEqual([{ id:'0', turn:1, excerpt:'봉투는 빨간색이었다.' }])
    })
})

describe('same-character linked rooms', () => {
    const room = (id: string, line: string, parent?: string): Chat => ({
        id, name: id, sceneRecallParent: parent, note:'', localLore:[],
        message:[{ role: 'user', data: line }]
    })
    it('recalls a grandparent from the very first turn and excludes unrelated rooms', () => {
        const first = room('1부','자비엘이 은반지를 주겠다고 맹세했다.')
        const second = room('2부','눈이 내렸다.', first.id)
        const third = room('3부','자비엘의 약속은 뭐였지?', second.id)
        const stray = room('외전','자비엘은 국경에서 약속했다.')
        const chain = linkedRooms(third, [stray, third, second, first])
        expect(chain.map(r => r.id)).toEqual(['3부','2부','1부'])
        const results = recallForRequest(third, [], chain)
        expect(results.map(s => s.roomId)).toEqual(['1부'])
        expect(locateSource(chain, results[0])?.body).toContain('은반지')
        third.sceneRecallPin = results[0]
        expect(selectedScene(third, [third])).toBeUndefined()
        expect(selectedScene(third, chain)?.roomName).toBe('1부')
    })
    it('handles missing links, cloned message IDs, and malformed cycles', () => {
        const a = room('a','문을 열었다.','b'), b = room('b','달빛 아래 약속했다.','a')
        a.message[0].chatId = b.message[0].chatId = 'shared'
        expect(linkedRooms(a,[a,b])).toEqual([a,b])
        expect(linkedRooms(a,[a])).toEqual([a])
        const source = searchRooms([a,b],'약속')[0]
        expect(locateSource([a,b],source)?.room).toBe(b)
    })
    it('reads archived payloads without touching the rooms or their memory settings', async () => {
        const archive = room('오래된 방','\uEF01COLDSTORAGE\uEF01archive')
        const current = room('현재 방','약속',archive.id)
        const original = structuredClone(archive)
        const rooms = await readSceneRooms([current,archive],async () => ({message:[{role:'char', data:'약속한 날짜는 8월 5일이었다.'}]}))
        expect(recallForRequest(current,[],rooms)[0].excerpt).toContain('8월 5일')
        expect(archive).toEqual(original)
        expect(await readSceneRooms([archive],async () => { throw Error() })).toEqual([archive])
    })
})
