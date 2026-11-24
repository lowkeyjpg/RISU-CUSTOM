// Android serves the pinned bundle on these private, per-workspace HTTPS origins.
export const isPocket = /^https:\/\/(?:home|p-[a-f0-9-]{36})\.risu-custom\.invalid$/.test(location.origin)
export const restoringPocket = isPocket && new URLSearchParams(location.search).has('restore')

export function pocketCommand(action: string, args: Record<string, string> = {}) {
    const value = window.prompt('RISU_CUSTOM_DEV', JSON.stringify({ action, ...args }))
    if (value === null || value.startsWith('error:')) {
        throw new Error(value?.slice(6) || '앱 작업이 취소되었습니다.')
    }
    return value
}

export function pocketWriter(name: string, mime = 'application/octet-stream') {
    const id = pocketCommand('begin', { name, mime })
    return new WritableStream<Uint8Array>({
        write(data) {
            for (let offset = 0; offset < data.length; offset += 32768) {
                const bytes = data.subarray(offset, offset + 32768)
                try {
                    pocketCommand('append', { id, bytes: btoa(String.fromCharCode(...bytes)) })
                } catch (error) {
                    pocketCommand('abort', { id })
                    throw error
                }
            }
        },
        close() { pocketCommand('finish', { id }) },
        abort() { pocketCommand('abort', { id }) }
    })
}

export async function savePocketBlob(blob: Blob, name: string) {
    await blob.stream().pipeTo(pocketWriter(name, blob.type))
}

export function enablePocketDownloads() {
    document.addEventListener('click', event => {
        const anchor = event.target instanceof Element && event.target.closest('a[download]')
        if (!(anchor instanceof HTMLAnchorElement) || !/^(blob:|data:)/.test(anchor.href)) return
        event.preventDefault()
        void fetch(anchor.href).then(r => r.blob()).then(blob => savePocketBlob(blob, anchor.download || 'download.bin'))
            .catch(error => window.alert(String(error)))
    }, true)
    document.addEventListener('contextmenu', async event => {
        const image = event.target
        if (!(image instanceof HTMLImageElement)) return
        event.preventDefault()
        if (!window.confirm('이 이미지를 다운로드 폴더에 저장할까요?')) return
        try {
            const response = await fetch(image.currentSrc || image.src)
            if (!response.ok) throw new Error('이미지를 읽을 수 없습니다.')
            const blob = await response.blob()
            if (!blob.type.startsWith('image/')) throw new Error('이미지 파일을 확인해 주세요.')
            const ext = blob.type.split('/')[1].split('+')[0].replace('jpeg', 'jpg')
            await savePocketBlob(blob, `RISU-image-${Date.now()}.${ext}`)
        } catch (error) { window.alert(String(error)) }
    })
}
