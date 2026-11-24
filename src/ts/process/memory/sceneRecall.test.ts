import { describe, expect, it } from 'vitest'
import type { Chat, Message } from '../../storage/database.svelte'
import { recallForRequest, searchScenes, selectedScene } from './sceneRecall'

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
