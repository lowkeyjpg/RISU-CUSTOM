import type { Chat, Message } from '../../storage/database.svelte'
import { isArchivedRoom, locateSource, type SceneSource } from './sceneRecall'
import { coldStorageHeader } from '../coldstorageData'

const conflict = '원문이 바뀌었거나 연결이 해제되었습니다. 작성한 내용을 복사한 뒤 원문을 다시 열어 주세요.'
type Archive = Message[] | { message: Message[], [key: string]: unknown }
// An archived edit creates a new payload, then switches only the edited room's pointer.
// Copied rooms may still share the old archive key.
export async function editScene(
    getRooms: () => Chat[], source: SceneSource, original: string, replacement: string,
    storage: { read: (key:string) => Promise<unknown>, write: (key:string, data:Archive) => Promise<boolean>, uuid: () => string }
): Promise<SceneSource> {
    const resolveRoom = () => source.roomId ? getRooms().find(r => r.id === source.roomId) : getRooms()[0]
    const room = resolveRoom()
    if (!room) throw Error(conflict)
    const pointer = isArchivedRoom(room) ? room.message[0].data : undefined
    let payload: Archive | undefined
    let messages = room.message
    if (pointer) {
        const data = await storage.read(pointer.slice(coldStorageHeader.length)) as Archive | null
        if (!data || !Array.isArray(Array.isArray(data) ? data : data.message)) throw Error('보관된 방을 읽지 못했습니다. 다시 시도해 주세요.')
        payload = data
        messages = Array.isArray(data) ? data : data.message
    }
    const location = locateSource([{...room, message: messages}], source)
    if (!location || messages[location.i].data !== original) throw Error(conflict)
    const i = location.i
    const id = messages[i].chatId || storage.uuid()
    const edited = { ...messages[i], chatId:id, data:replacement }
    if (payload && pointer) {
        const updated = messages.slice()
        updated[i] = edited
        const key = storage.uuid()
        if (!await storage.write(key, Array.isArray(payload) ? updated : {...payload, message:updated})) {
            throw Error('보관된 방의 변경 내용을 저장하지 못했습니다. 다시 시도해 주세요.')
        }
        if (resolveRoom() !== room || room.message[0]?.data !== pointer) throw Error(conflict)
        room.message[0].data = coldStorageHeader + key
    } else {
        room.message[i] = edited
    }
    return { ...source, id, turn:i + 1, excerpt:replacement.slice(0, 420) }
}
