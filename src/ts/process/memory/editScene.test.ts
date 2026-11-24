import { describe, expect, it } from 'vitest'
import type { Chat } from '../../storage/database.svelte'
import { coldStorageHeader } from '../coldstorageData'
import { editScene } from './editScene'
import { searchRooms } from './sceneRecall'

const message = (data: string) => ({ role:'char' as const, data })
function room(id: string, ...lines: string[]): Chat {
    return { id, name:id, note:'', localLore:[], message:lines.map(message) }
}
const source = { roomId:'past', id:'', turn:1, excerpt:'금' }
const storage = { read:async () => null, write:async () => true, uuid:() => 'new-key' }

describe('reading and editing an exact search result', () => {
    it('finds literal single characters even beyond the twentieth hit', () => {
        const old = room('past','금빛 첫 장면',...Array(28).fill('금빛 저녁'))
        const hits = searchRooms([old], '금', old.message.length, Infinity, '금')
        expect(hits).toHaveLength(29)
        expect(hits.at(-1)?.turn).toBe(1)
    })
    it('edits only the selected room and preserves raw markup, other fields and turns', async () => {
        const current = room('current','금'), old = room('past','금 <b>약속</b>', '금')
        const updated = await editScene(() => [current, old], source, old.message[0].data, '은 <b>약속</b>', storage)
        expect(old.message[0].data).toBe('은 <b>약속</b>')
        expect([current.message[0].data,old.message[1].data]).toEqual(['금','금'])
        await expect(editScene(() => [old], updated, 'old draft', 'conflict', storage)).rejects.toThrow()
    })
    it('preserves a shared archive, Hypa data, and original pointer on storage failure', async () => {
        const old = room('past', coldStorageHeader+'old')
        const copy = room('copy', coldStorageHeader+'old')
        const data = {message:[message('금')], hypaV3Data:{summaries:[{text:'summary'}]}, localLore:[{key:'note'}]}
        const read = async () => data
        await expect(editScene(() => [old],source,'금','은',{...storage,read,write:async () => false})).rejects.toThrow()
        expect(old.message[0].data).toBe(coldStorageHeader+'old')
        let written: unknown
        await editScene(() => [old, copy],source,'금','은',{...storage,read,write:async (_,d) => { written = d; return true }})
        expect(written).toMatchObject({...data,message:[{role:'char',data:'은'}]})
        expect(data.message[0].data).toBe('금')
        expect(old.message[0].data).toBe(coldStorageHeader+'new-key')
        expect(copy.message[0].data).toBe(coldStorageHeader+'old')
    })
    it('does not switch the pointer when a room is disconnected during an archived edit', async () => {
        const old = room('past', coldStorageHeader+'old')
        let rooms = [old]
        await expect(editScene(() => rooms,source,'금','은',{...storage,read:async () => [message('금')],
            write:async () => { rooms=[]; return true }})).rejects.toThrow()
        expect(old.message[0].data).toBe(coldStorageHeader+'old')
    })
})
