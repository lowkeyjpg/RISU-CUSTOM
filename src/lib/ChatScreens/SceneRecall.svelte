<script lang="ts">
    import { onMount, tick } from 'svelte'
    import { v4 } from 'uuid'
    import { X, Search, Pin } from '@lucide/svelte'
    import type { Chat } from '../../ts/storage/database.svelte'
    import { searchRooms, linkedRooms, readSceneRooms, isArchivedRoom, locateSource, selectedScene, type SceneHit, type SceneSource } from '../../ts/process/memory/sceneRecall'

    import { getColdStorageItem } from "../../ts/process/coldstorage.svelte"

    let { chat, siblings, close, jump }: { chat: Chat, siblings: Chat[], close: () => void, jump: (index:number) => void } = $props()
    let query = $state('')
    let dialog: HTMLDialogElement
    let chain = $derived(linkedRooms(chat, siblings))
    let archived = $state.raw<Chat[]>([])
    let rooms = $derived(chain.map(room => isArchivedRoom(room) ? (archived.find(r => r.id === room.id) ?? room) : room))
    let loading = $state(false)
    let search = $state('')
    let preview = $state<{ title: string, body: string }>()
    let results = $derived(search ? searchRooms(rooms, search) : [])
    let pinned = $derived(selectedScene(chat, rooms))
    let parentChoices = $derived(siblings.filter(room => room !== chat && (!chat.id || !linkedRooms(room, siblings).some(r => r.id === chat.id))))
    let parentValue = $derived(chat.sceneRecallParent ? String(siblings.findIndex(r => r.id === chat.sceneRecallParent)) : '')
    $effect(() => {
        const term = query.trim()
        if (!term) { search = ''; return }
        const timer = setTimeout(() => { search = term }, 130)
        return () => clearTimeout(timer)
    })
    $effect(() => {
        const cold = chain.filter(isArchivedRoom)
        archived = []
        loading = cold.length > 0
        if (!cold.length) return
        let active = true
        readSceneRooms(cold, getColdStorageItem).then(result => {
            if (active) { archived = result; loading = false }
        })
        return () => { active = false }
    })
    function connect(index: string) {
        const parent = index === '' ? undefined : siblings[Number(index)]
        if (parent && !parentChoices.includes(parent)) return
        if (parent) parent.id ||= v4()
        chat.sceneRecallParent = parent?.id
        preview = undefined
    }
    let lastSources = $derived(chat.message.findLast(m => m.role === 'char')?.generationInfo?.sceneSources ?? [])
    onMount(() => { dialog.showModal() })

    function pin(hit: SceneHit) {
        chat.sceneRecallPin = { id: hit.id, roomId: hit.roomId, turn: hit.turn, excerpt: hit.excerpt }
    }
    async function openSource(source: SceneSource) {
        const location = locateSource(rooms, source)
        if (!location) return
        const { room, i, body } = location
        if (room.id !== chat.id) {
            preview = { title: room.name + ' · ' + (i + 1) + '번 메시지', body }
            return
        }
        close()
        await tick()
        jump(i)
    }
</script>
<dialog bind:this={dialog} onclose={close} aria-label="장면 기억" class="fixed inset-0 m-auto w-[min(94vw,40rem)] max-h-[84dvh] overflow-y-auto rounded-xl border border-darkborderc bg-bgcolor p-5 text-textcolor backdrop:bg-black/60">
    <header class="mb-4 flex items-center justify-between"><h2 class="text-xl font-bold">장면 기억</h2><button aria-label="닫기" onclick={close}><X /></button></header>
    <label class="mb-2 block">이전 방 이어쓰기
        <select class="mt-1 w-full rounded-md border border-darkborderc bg-bgcolor p-2" value={parentValue} onchange={e => connect(e.currentTarget.value)}>
            <option value="">연결 안 함</option>
            {#if parentValue === '-1'}<option value="-1" disabled>기존 연결을 찾을 수 없음</option>{/if}
            {#each parentChoices as room}
                <option value={String(siblings.indexOf(room))}>{room.name} · {isArchivedRoom(room) ? '보관된 방' : room.message.length + '개 메시지'}</option>
            {/each}
        </select>
    </label>
    {#if rooms.length > 1}<p class="mb-3 text-sm text-textcolor2">검색 범위 · {rooms.map(r => r.name).reverse().join(' → ')}</p>{/if}
    {#if chain.at(-1)?.sceneRecallParent}<p class="mb-2 text-sm">이전 방 연결을 확인해 주세요. 일부 방을 찾을 수 없습니다.</p>{/if}
    {#if loading}<p class="text-sm" role="status">보관된 방을 읽고 있습니다.</p>
    {:else if rooms.some(isArchivedRoom)}<p class="text-sm" role="status">보관 원문을 읽을 수 없는 방 · {rooms.filter(isArchivedRoom).map(r => r.name).join(', ')}</p>{/if}
    {#if preview}
        <section class="my-3 rounded-md border border-darkborderc p-3">
            <strong>{preview.title}</strong><button class="ml-3 underline" onclick={() => preview = undefined}>원문 접기</button>
            <p class="mt-2 max-h-[40dvh] overflow-y-auto whitespace-pre-wrap">{preview.body}</p>
        </section>
    {/if}
    <label class="mb-4 flex items-center gap-2"><input type="checkbox" checked={chat.sceneRecallAuto !== false} onchange={e => chat.sceneRecallAuto = e.currentTarget.checked} />관련 장면 자동 참고</label>
    <label class="mb-3 flex items-center gap-2 rounded-md border border-darkborderc px-3"><Search size={18}/><input type="search" aria-label="연결된 채팅 원문 검색" placeholder="인물·장소·약속으로 원문 검색" class="w-full bg-transparent py-3 outline-none" bind:value={query}/></label>
    {#if pinned}
        <section class="mb-4 rounded-md border border-darkborderc p-3"><div class="flex justify-between gap-2"><strong>고정한 장면 · {pinned.roomName ?? chat.name} · {pinned.turn}번</strong><button onclick={() => chat.sceneRecallPin = undefined}>고정 해제</button></div><p class="mt-2 whitespace-pre-wrap text-sm">{pinned.excerpt}</p></section>
    {/if}
    {#if search}
        {#each results as hit (JSON.stringify([hit.roomId, hit.turn]))}
            <article class="border-b border-darkborderc py-3">
                <div class="text-sm text-textcolor2">{hit.roomName} · {hit.turn}번 메시지 · {hit.role === 'user' ? '사용자' : '캐릭터'}</div>
                <p class="my-2 whitespace-pre-wrap break-words">{hit.excerpt}</p>
                <div class="flex gap-4"><button class="underline" onclick={() => openSource(hit)}>{hit.roomId === chat.id ? '원문으로 이동' : '이전 방 원문 보기'}</button><button class="inline-flex items-center gap-1" onclick={() => pin(hit)}><Pin size={15}/>{pinned && (pinned.roomId ?? chat.id) === hit.roomId && pinned.turn === hit.turn ? '고정됨' : '답변에 참고하도록 고정'}</button></div>
            </article>
        {:else}
            <p>검색 범위에서 일치하는 장면을 찾지 못했어요. 인물 이름이나 대사의 일부로 찾아보세요.</p>
        {/each}
    {:else if lastSources.length}
        <h3 class="font-semibold">직전 답변에 첨부한 원문</h3>
        {#each lastSources as source}
            <div class="border-b border-darkborderc py-3"><p class="whitespace-pre-wrap text-sm">{source.excerpt}</p>
                {#if locateSource(rooms, source)}<button class="mt-2 underline" onclick={() => openSource(source)}>{source.roomName ?? chat.name} · {source.turn}번 원문 보기</button>{/if}
            </div>
        {/each}
    {:else}
        <p class="text-sm text-textcolor2">이전 방을 연결하면 그 방과 앞서 연결한 방의 원문도 함께 찾습니다. 장면을 고정하면 해제할 때까지 답변에 참고합니다.</p>
    {/if}
</dialog>
