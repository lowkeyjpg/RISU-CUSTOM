(() => {
    if (window !== window.top) return;

    const screen = '.default-chat-screen';
    const row = '.risu-chat[data-chat-index]';
    const media = 'img, picture, video, .risu-inlay-image, [style*="background-image"]';
    const statusSelector = '.os-status, [data-os-theme][data-os-decor], statusui, .status-ui, .statusui, .status_ui, [data-status-ui], [id^="status-ui"], [class*="status-window"], [class*="status-card"]';
    const setting = 'risuPocketReadingMode';
    let mode = ['quiet', 'document', 'feed', 'messenger'].includes(localStorage.getItem(setting)) ? 'quiet' : 'original';
    let transparent = localStorage.getItem('risuPocketTransparentIcon') === 'true';
    let allImages = false;
    let toolbar, menu, icon, imagesButton, queued;

    const css = `
        .rp-reading-controls { position:relative; flex:0 0 22px; align-self:center; margin-inline:0; z-index:35; }
        .rp-reading-controls[hidden], .rp-reading-menu[hidden], .rp-turn-tool[hidden] { display:none!important; }
        .rp-reading-icon { width:22px; min-height:40px; display:grid; place-items:center; padding:0;
            border:0; background:transparent; color:inherit; opacity:.64; touch-action:manipulation; user-select:none; }
        .rp-reading-icon[data-rp-transparent] {opacity:.25;}
        .rp-reading-icon:focus-visible, .rp-reading-icon[aria-expanded="true"] {opacity:1;}
        .rp-reading-menu { position:absolute; inset:auto 0 100% auto; display:grid; min-width:145px; padding:4px;
            background:#25282a; color:#c9cccb; border:1px solid #45494a; border-radius:9px; box-shadow:0 4px 14px #0005; }
        textarea.text-input-area { flex:1 1 auto!important; min-width:0!important; }
        @media(max-width:600px) {
            html[data-rp-reading] .default-chat-screen > div:has(> .text-input-area) { flex-wrap:wrap; padding-inline:8px; }
            html[data-rp-reading] .default-chat-screen textarea.text-input-area {
                flex:1 0 100%!important; width:100%!important; margin:0!important; border-radius:6px; border-right-width:1px;
            }
        }
        .rp-reading-menu button { font:13px system-ui; text-align:left; padding:9px 10px; white-space:nowrap; }
        .rp-reading-menu button[aria-pressed="true"] { background:#363b3e; border-radius:5px; }
        .rp-turn-tool { display:block; width:max-content; max-width:100%; margin:6px 0;
            font:12px system-ui; padding:5px 8px; color:#aaa597; background:transparent;
            border:1px solid #464138; border-radius:5px; white-space:normal; }
        html:not([data-rp-reading]) :is(.rp-turn-tool,.rp-status-text), .rp-status-text[hidden] { display:none!important; }
        html[data-rp-reading] ${screen} { background:#252420!important; color:#c6c2b8!important; }
        html[data-rp-reading] ${row} { background:transparent!important; border:0!important; width:100%; }
        html[data-rp-reading] ${row} > :first-child { margin:0!important; padding:6px 17px!important; background:transparent!important; }
        html[data-rp-reading] ${row} :is(.shadow-lg.bg-textcolor2,.shadow-lg.border-textcolor2,.unmargin.text-xl,[data-chat-avatar]) { display:none!important; }
        html[data-rp-reading] ${row} > :first-child > span.flex.flex-col { margin-inline:0!important; }
        html[data-rp-reading] ${row} :is(.chattext,.os-surface,.os-surface.os-user-input) {
            text-align:left!important; background:transparent!important; color:#c6c2b8!important;
            font:14px/1.9 system-ui,sans-serif!important; display:block; width:100%; min-width:0!important; }
        html[data-rp-reading] ${row} .chattext :is(p,em,strong,blockquote,li,span,h1,h2,h3,div) { color:inherit!important; }
        html[data-rp-reading] ${row} .chattext :is(h1,h2,h3) { font-size:1.08em!important; }
        html[data-rp-reading] ${row} .chattext p {margin:0 0 .65em!important;}
        html[data-rp-reading] ${row} .chattext :is(.os-bubble,.regex-quote-block,.regex-thought-block) {
            background:none!important; border:0!important; box-shadow:none!important; color:inherit!important; }
        html[data-rp-reading] ${row} .chattext .os-message {justify-content:flex-start!important;}
        html[data-rp-reading]:not([data-rp-images]) ${row}:not([data-rp-images]) .chattext :is(${media}) { display:none!important; }
        html[data-rp-reading] :is(${statusSelector},[data-rp-status]) { display:none!important; }
        html[data-rp-reading] .rp-status-text { color:#aaa597!important; font:12px/1.65 system-ui,sans-serif;
            white-space:pre-wrap; margin:5px 0 12px; }
        html[data-rp-reading] .rp-status-toggle { border:0; padding-left:0; }
    `;

    function button(label, className, action) {
        const node = document.createElement('button');
        node.type = 'button';
        node.textContent = label;
        node.className = className;
        node.addEventListener('click', event => {
            event.stopPropagation();
            action(node);
        });
        return node;
    }

    function setMode() {
        const root = document.documentElement;
        allImages = false;
        root.removeAttribute('data-rp-images');
        document.querySelectorAll(`${row}[data-rp-images]`).forEach(turn => turn.removeAttribute('data-rp-images'));
        if (mode === 'original') root.removeAttribute('data-rp-reading');
        else root.dataset.rpReading = mode;
        imagesButton.hidden = mode === 'original';
        imagesButton.textContent = '삽화 전체 표시';
        icon.setAttribute('aria-pressed', String(mode === 'quiet'));
        for (const item of menu.querySelectorAll('[data-rp-mode]')) {
            item.setAttribute('aria-pressed', String(item.dataset.rpMode === mode));
        }
        update();
    }

    function makeToolbar() {
        toolbar = document.createElement('div');
        toolbar.className = 'rp-reading-controls';
        toolbar.hidden = true;
        menu = document.createElement('div');
        menu.className = 'rp-reading-menu';
        menu.hidden = true;
        const closeMenu = () => {
            menu.hidden = true;
            icon.setAttribute('aria-expanded', 'false');
        };
        const showMenu = () => {
            menu.hidden = false;
            icon.setAttribute('aria-expanded', 'true');
        };
        let pressTimer, suppressClick = false;
        const cancelPress = () => clearTimeout(pressTimer);
        const selectMode = value => {
            mode = value;
            localStorage.setItem(setting, mode);
            setMode();
            closeMenu();
        };
        icon = button('', 'rp-reading-icon', () => {
            if (suppressClick) { suppressClick = false; return; }
            if (!menu.hidden) return closeMenu();
            selectMode(mode === 'quiet' ? 'original' : 'quiet');
        });
        icon.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary) return;
            suppressClick = false;
            pressTimer = setTimeout(() => {
                suppressClick = true;
                showMenu();
            }, 470);
        });
        ['pointerup','pointercancel','pointerleave'].forEach(event => icon.addEventListener(event, cancelPress));
        icon.addEventListener('contextmenu', event => {
            event.preventDefault();
            cancelPress();
            suppressClick = true;
            showMenu();
        });
        icon.addEventListener('keydown', event => {
            if (event.key === 'ContextMenu' || event.key === 'ArrowUp') {
                event.preventDefault();
                showMenu();
                menu.querySelector('button')?.focus();
            }
        });
        icon.toggleAttribute('data-rp-transparent', transparent);
        icon.setAttribute('aria-label', '읽기 모드');
        icon.setAttribute('aria-expanded', 'false');
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('width','12'); svg.setAttribute('height','12'); svg.setAttribute('viewBox','0 0 20 20');
        svg.setAttribute('aria-hidden','true');
        const shape = document.createElementNS(svg.namespaceURI,'path');
        shape.setAttribute('d','M3 4.5h14v11H3z M3 8.5h14 M8 8.5v7');
        shape.setAttribute('fill','none'); shape.setAttribute('stroke','currentColor');
        shape.setAttribute('stroke-width','1.5');
        svg.append(shape); icon.append(svg);
        const modes = [['original','기본 보기'], ['quiet','일코용']];
        for (const [value,label] of modes) {
            const item = button(label, '', () => { selectMode(value); icon.focus(); });
            item.dataset.rpMode = value;
            menu.append(item);
        }
        imagesButton = button('삽화 전체 표시', '', node => {
            allImages = !allImages;
            document.documentElement.toggleAttribute('data-rp-images', allImages);
            if (!allImages) document.querySelectorAll(`${row}[data-rp-images]`).forEach(turn => turn.removeAttribute('data-rp-images'));
            node.textContent = allImages ? '삽화 모두 접기' : '삽화 전체 표시';
            closeMenu();
            update();
        });
        const opacity = button('아이콘 투명하게', '', node => {
            transparent = !transparent;
            localStorage.setItem('risuPocketTransparentIcon', String(transparent));
            icon.toggleAttribute('data-rp-transparent', transparent);
            node.setAttribute('aria-pressed', String(transparent));
        });
        opacity.setAttribute('aria-pressed', String(transparent));
        menu.append(imagesButton, opacity);
        toolbar.append(icon, menu);
        document.addEventListener('pointerdown', event => {
            if (!menu.hidden && !toolbar.contains(event.target)) closeMenu();
        });
        toolbar.addEventListener('keydown', event => {
            if (event.key === 'Escape') { closeMenu(); icon.focus(); }
        });
        setMode();
    }

    function plainText(node) {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('script,style,svg,button,img').forEach(part => part.remove());
        copy.querySelectorAll('br').forEach(part => part.replaceWith('\n'));
        return (copy.textContent || '').trim();
    }

    function statusData(status) {
        const meta = [...status.querySelectorAll('.os-meta .os-value')].map(plainText);
        const location = status.querySelector('.os-location');
        const decorated = meta.length > 0 || location;
        const raw = decorated ? '' : plainText(status);
        const fields = raw.split('|').map(part => part.trim());
        const date = (meta[0] || fields[0] || '').match(/\b\d{4}[./-](\d{1,2}[./-]\d{1,2})/);
        const time = (meta[1] || fields[1] || raw).match(/\b\d{1,2}:\d{2}(?:\s*(?:AM|PM))?/i);
        const place = location ? plainText(location) : fields[5];
        const notes = decorated
            ? [...status.querySelectorAll('.os-person .os-field')].map(field => {
                const label = field.querySelector('.os-label');
                const value = field.querySelector('.os-value');
                return value ? [label && plainText(label), plainText(value)].filter(Boolean).join(' · ') : '';
            }).filter(Boolean).join('\n')
            : fields.slice(6).filter(Boolean).join('\n') || raw;
        return {
            label: [date?.[1], time?.[0]].filter(Boolean).join(' · ') || '상태',
            text: [place && '장소 · ' + place, notes].filter(Boolean).join('\n')
        };
    }

    function isStatusLine(node) {
        const content = (node.textContent || '').trim();
        return content.length < 4000 && /^\s*\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(content)
            && (content.match(/\|/g) || []).length >= 5;
    }

    function decorateTurn(turn) {
        const body = turn.querySelector('.chattext');
        if (!body || turn.querySelector('.message-edit-area')) return;
        let reveal = turn.querySelector('.rp-image-toggle');
        const hasIllustration = [...body.querySelectorAll(media)].some(node => !node.closest(statusSelector));
        if (!reveal && hasIllustration) {
            reveal = button('이미지 보기', 'rp-turn-tool rp-image-toggle', () => {
                const shown = turn.toggleAttribute('data-rp-images');
                reveal.textContent = shown ? '이미지 접기' : '이미지 보기';
                reveal.setAttribute('aria-expanded', String(shown));
            });
            body.append(reveal);
        }
        if (reveal) {
            reveal.hidden = allImages || !hasIllustration;
            const shown = turn.hasAttribute('data-rp-images');
            const label = shown ? '이미지 접기' : '이미지 보기';
            if (reveal.textContent !== label) reveal.textContent = label;
            reveal.setAttribute('aria-expanded', String(shown));
        }

        const statuses = [...body.querySelectorAll(statusSelector),
            ...[...body.querySelectorAll('p, div')].filter(isStatusLine)];
        for (const status of statuses) {
            if (status.hasAttribute('data-rp-status') || status.parentElement?.closest(statusSelector)
                    || (!status.matches(statusSelector) && statuses.some(other => other !== status && status.contains(other)))) continue;
            status.setAttribute('data-rp-status','');
            const value = statusData(status);
            const details = document.createElement('div');
            details.className = 'rp-status-text';
            details.hidden = true;
            details.textContent = value.text;
            const toggle = button(value.label, 'rp-turn-tool rp-status-toggle', node => {
                details.hidden = !details.hidden;
                node.setAttribute('aria-expanded', String(!details.hidden));
            });
            toggle.setAttribute('aria-expanded','false');
            status.before(toggle, details);
        }

    }

    function update() {
        const composer = document.querySelector('textarea.text-input-area')?.parentElement;
        if (composer && toolbar.parentElement !== composer) composer.append(toolbar);
        toolbar.hidden = !composer;
        if (mode === 'quiet') document.querySelectorAll(row).forEach(decorateTurn);
    }

    function init() {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.append(style);
        makeToolbar();
        new MutationObserver(() => {
            if (!queued) queued = requestAnimationFrame(() => { queued = 0; update(); });
        }).observe(document.body, { childList:true, subtree:true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
})();
