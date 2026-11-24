import "katex/dist/katex.min.css";
import "./ts/polyfill";
import "core-js/actual"
import "./ts/storage/database.svelte"
import App from "./App.svelte";
import { loadData } from "./ts/bootstrap";
import { initHotkey } from "./ts/hotkey";
import { preLoadCheck } from "./preload";
import { mount } from "svelte";

window.addEventListener('vite:preloadError', (event) => {
    console.error("Chunk load error detected:", event);
    alert("The server has been updated or the network connection has been lost. Please refresh the page.");
});

import { enablePocketDownloads, isPocket, restoringPocket } from "./ts/pocket";
import PocketRestore from "./lib/Mobile/PocketRestore.svelte";
import { setDatabase, type Database } from "./ts/storage/database.svelte";

preLoadCheck()
if (isPocket) {
    enablePocketDownloads()
    document.title = 'RISU CUSTOM DEV'
    if (!restoringPocket) {
        const script = document.createElement('script')
        script.src = '/pocket-reading.js'
        document.head.append(script)
    }
}
if (restoringPocket) setDatabase({} as Database)
let app = mount(restoringPocket ? PocketRestore : App, {
    target: document.getElementById("app"),
});
if (!restoringPocket) {
    loadData()
    initHotkey()
}
document.getElementById('preloading').remove()

export default app;