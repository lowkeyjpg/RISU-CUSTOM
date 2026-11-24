import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importChat } from './characters'

const state = vi.hoisted(() => ({
    db: { characters: [{ chats: [] as unknown[], chatFolders: [] }] },
    select: vi.fn(), error: vi.fn(), notice: vi.fn(),
}))
vi.mock('./storage/database.svelte', () => ({ getDatabase: () => state.db }))
vi.mock('./alert', () => ({ alertError: state.error, alertNormal: state.notice }))
vi.mock('./util', () => ({ selectSingleFile: state.select }))
vi.mock('./stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { DBState: { db: state.db }, selectedCharID: writable(0) }
})
vi.mock('../lang', () => ({ language: { successImport: 'ok' } }))
vi.mock('./globalApi.svelte', () => ({}))
vi.mock('./media', () => ({}))
vi.mock('./process/inlayScreen', () => ({}))
vi.mock('./parser/parser.svelte', () => ({}))
vi.mock('./translator/translator', () => ({}))
vi.mock('./process/index.svelte', () => ({}))
vi.mock('./characterCards', () => ({}))
vi.mock('./pngChunk', () => ({}))
vi.mock('./process/coldstorage.svelte', () => ({}))

describe('Pocket chat export import', () => {
    beforeEach(() => {
        state.db.characters[0].chats = [{ name: 'previous' }]
        vi.clearAllMocks()
    })
    it('imports a Pocket .bin JSON export as a new chat with its memory and local lore', async () => {
        const data = { id: 'old-id', message: [{ role:'char', data:'hello' }], localLore: [{ key:'A' }],
            hypaV3Data: { summaries: [{ text: 'old event' }] }, modules: ['example'] }
        const file = { type: 'risuChat', ver: 2, folders: [], data }
        state.select.mockResolvedValue({ name:'chat.bin', data:Buffer.from(JSON.stringify(file)) })
        await importChat()
        expect(state.db.characters[0].chats).toEqual([{ ...data, id: expect.any(String) }, { name:'previous' }])
        expect((state.db.characters[0].chats[0] as {id:string}).id).not.toBe(data.id)
        expect(state.error).not.toHaveBeenCalled()
    })
    it('redirects a binary archive to the full restore screen without touching the current chats', async () => {
        state.select.mockResolvedValue({ name:'full.bin', data: new Uint8Array([16,0,0,0]) })
        await importChat()
        expect(state.error).toHaveBeenCalledWith(expect.stringContaining('전체 백업'))
        expect(state.db.characters[0].chats).toEqual([{ name:'previous' }])
    })
})
