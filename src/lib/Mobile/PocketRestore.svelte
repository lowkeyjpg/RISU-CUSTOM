<script lang="ts">
    import AlertComp from '../Others/AlertComp.svelte'
    import { alertStore } from '../../ts/stores.svelte'
    import { LoadLocalBackup } from '../../ts/drive/backuplocal'
    import { pocketCommand } from '../../ts/pocket'
</script>
<main class="min-h-screen bg-bgcolor text-textcolor p-6 flex flex-col gap-4 justify-center">
    <h1 class="text-2xl font-bold">새 공간에 백업 복원</h1>
    <p>리수에서 ‘로컬 백업 저장’으로 만든 .bin 파일을 선택해 주세요. 복원이 끝나면 이 공간이 열립니다.</p>
    <button class="rounded-md p-3 bg-darkbutton" onclick={() => LoadLocalBackup()}>전체 백업 선택</button>
    <button class="p-2" onclick={() => pocketCommand('cancelStage')}>기존 공간으로 돌아가기</button>
    {#if $alertStore.type !== 'none'}<AlertComp />{/if}
</main>
