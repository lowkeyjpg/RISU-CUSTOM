<script lang="ts">
    import { onMount, tick } from 'svelte'
    import { v4 } from 'uuid'
    import { X, Search, Pin } from '@lucide/svelte'
    import type { Chat } from '../../ts/storage/database.svelte'
    import { searchScenes, selectedScene, type SceneHit, type SceneSource } from '../../ts/process/memory/sceneRecall'

    let { chat, close, jump }: { chat: Chat, close: () => void, jump: (index:number) => void } = $props()
    let query = $state('')
    let dialog: HTMLDialogElement
    let results = $derived(query.trim() ? searchScenes(chat.message, query) : [])
    let pinned = $derived(selectedScene(chat))
    let lastSources = $derived(chat.message.findLast(m => m.role === 'char')?.generationInfo?.sceneSources ?? [])
    onMount(() => { dialog.showModal() })

    function pin(hit: SceneHit) {
        const message = chat.message[hit.turn - 1]
        message.chatId ??= v4()
        chat.sceneRecallPin = { id: message.chatId, excerpt: hit.excerpt }
    }
    async function openSource(source: SceneSource) {
        const i = source.id ? chat.message.findIndex(m => m.chatId === source.id) : source.turn - 1
        if (i < 0) return
        close()
        await tick()
        jump(i)
    }
</script>
<dialog bind:this={dialog} onclose={close} aria-label="장면 기억" class="fixed inset-0 m-auto w-[min(94vw,40rem)] max-h-[84dvh] overflow-y-auto rounded-xl border border-darkborderc bg-bgcolor p-5 text-textcolor backdrop:bg-black/60">
    <header class="mb-4 flex items-center justify-between"><h2 class="text-xl font-bold">장면 기억</h2><button aria-label="닫기" onclick={close}><X /></button></header>
    <label class="mb-4 flex items-center gap-2"><input type="checkbox" checked={chat.sceneRecallAuto !== false} onchange={e => chat.sceneRecallAuto = e.currentTarget.checked} />관련 장면 자동 참고</label>
    <label class="mb-3 flex items-center gap-2 rounded-md border border-darkborderc px-3"><Search size={18}/><input type="search" aria-label="현재 채팅 원문 검색" placeholder="인물·장소·약속으로 원문 검색" class="w-full bg-transparent py-3 outline-none" bind:value={query}/></label>
    {#if pinned}
        <section class="mb-4 rounded-md border border-darkborderc p-3"><div class="flex justify-between gap-2"><strong>고정한 장면 · {pinned.turn}번</strong><button onclick={() => chat.sceneRecallPin = undefined}>고정 해제</button></div><p class="mt-2 whitespace-pre-wrap text-sm">{pinned.excerpt}</p></section>
    {/if}
    {#if query.trim()}
        {#each results as hit (hit.turn)}
            <article class="border-b border-darkborderc py-3">
                <div class="text-sm text-textcolor2">{hit.turn}번 메시지 · {hit.role === 'user' ? '사용자' : '캐릭터'}</div>
                <p class="my-2 whitespace-pre-wrap break-words">{hit.excerpt}</p>
                <div class="flex gap-4"><button class="underline" onclick={() => openSource(hit)}>원문으로 이동</button><button class="inline-flex items-center gap-1" onclick={() => pin(hit)}><Pin size={15}/>{pinned?.turn === hit.turn ? '고정됨' : '답변에 참고하도록 고정'}</button></div>
            </article>
        {:else}
            <p>현재 채팅에서 일치하는 장면을 찾지 못했어요. 인물 이름이나 대사의 일부로 찾아보세요.</p>
        {/each}
    {:else if lastSources.length}
        <h3 class="font-semibold">직전 답변에 첨부한 원문</h3>
        {#each lastSources as source}
            <div class="border-b border-darkborderc py-3"><p class="whitespace-pre-wrap text-sm">{source.excerpt}</p>
                {#if chat.message.some(m => m.chatId === source.id)}<button class="mt-2 underline" onclick={() => openSource(source)}>{source.turn}번 원문으로 이동</button>{/if}
            </div>
        {/each}
    {:else}
        <p class="text-sm text-textcolor2">현재 채팅에서 찾습니다. 장면을 고정하면 해제할 때까지 답변에 참고합니다.</p>
    {/if}
</dialog>
