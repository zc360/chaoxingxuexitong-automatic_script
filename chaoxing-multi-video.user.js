// ==UserScript==
// @name         学习通网课多功能插件
// @namespace    local.chaoxing.multi-video
// @version      2.1.2
// @description  学习通自动播放视频，多视频同时播放（仅适用于同一标签页内多个视频和多个窗口不同标签页，不能同一窗口多标签页播放），切到后台保持播放，去除鼠标移出检测，新视频自动静音。
// @match        https://*.chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mooc-ans/mycourse/studentstudy*
// @match        https://*.chaoxing.com/knowledge/cards*
// @match        https://*.chaoxing.com/mooc-ans/knowledge/cards*
// @match        https://*.chaoxing.com/ananas/modules/video/index.html*
// @match        https://*.chaoxing.com/mooc-ans/ananas/modules/video/index.html*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @license      GPL-3.0-or-later
// ==/UserScript==

(() => {
    'use strict';
    if (window.__cxMultiVideoSettingsInstalled) return;
    window.__cxMultiVideoSettingsInstalled = true;

    const SETTINGS_KEY = 'cx-multi-video-settings-v2';
    const DEFAULTS = { mouseLeave: true, autoMute: true, multiVideo: true, autoNext: false, nextClicks: 1 };
    const FEATURES = {
        mouseLeave: '屏蔽鼠标离开窗口检测',
        autoMute: '自动静音',
        multiVideo: '多视频同时播放',
        autoNext: '自动点击下一节'
    };
    function normalizeSettings(value) {
        const next = { ...DEFAULTS };
        for (const key of Object.keys(FEATURES)) {
            if (typeof value?.[key] === 'boolean') next[key] = value[key];
        }
        const count = Number(value?.nextClicks);
        if (Number.isInteger(count)) next.nextClicks = Math.min(5, Math.max(1, count));
        return next;
    }
    function readSettings() {
        try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
        catch (_) { return { ...DEFAULTS }; }
    }
    let settings = readSettings();
    let settingsRevision = 0;
    window.addEventListener('storage', event => {
        if (event.key !== SETTINGS_KEY && event.key !== null) return;
        applySettings(readSettings());
    });

    function applySettings(next) {
        if (settings.autoNext && !next.autoNext) settingsRevision++;
        settings = next;
        applyFocusProtection();
        installCookieFilter();
        window.dispatchEvent(new Event('cx-settings-updated'));
    }

    function saveSettings(changes) {
        const next = normalizeSettings({ ...settings, ...changes });
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); }
        catch (_) { /* 存储不可用时只更新当前页面。 */ }
        applySettings(next);
    }

    const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')?.get;
    const leaving = event => {
        if (!settings.mouseLeave) return;
        if (event.type === 'blur' && event.target !== window && event.target !== document) return;
        if ((event.type === 'mouseout' || event.type === 'pointerout') && event.relatedTarget) return;
        if ((event.type === 'mouseleave' || event.type === 'pointerleave') &&
            ![window, document, document.documentElement, document.body].includes(event.target)) return;
        event.stopImmediatePropagation();
    };
    for (const type of ['blur', 'visibilitychange', 'webkitvisibilitychange', 'mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
        window.addEventListener(type, leaving, true);
    }
    const focusDescriptors = new Map();
    function applyFocusProtection() {
        const values = { hidden: false, webkitHidden: false, visibilityState: 'visible', webkitVisibilityState: 'visible', hasFocus: () => true };
        for (const [name, value] of Object.entries(values)) {
            if (settings.mouseLeave && !focusDescriptors.has(name)) {
                const original = Object.getOwnPropertyDescriptor(document, name);
                if (original && !original.configurable) continue;
                focusDescriptors.set(name, original);
                Object.defineProperty(document, name, { configurable: true, get: () => value });
            } else if (!settings.mouseLeave && focusDescriptors.has(name)) {
                const original = focusDescriptors.get(name);
                if (original) Object.defineProperty(document, name, original);
                else delete document[name];
                focusDescriptors.delete(name);
            }
        }
    }
    applyFocusProtection();

    const playerFrame = /\/ananas\/modules\/video\/index\.html$/.test(location.pathname);
    let cookieReader;
    function installCookieFilter() {
        if (!playerFrame || !settings.multiVideo) return;
        const ext = window.Ext;
        const original = ext?.getCookie;
        if (typeof original !== 'function' || original === cookieReader) return;
        cookieReader = function (name) {
            if (settings.multiVideo && name === 'videojs_id') return undefined;
            return original.apply(this, arguments);
        };
        ext.getCookie = cookieReader;
    }
    if (playerFrame) {
        window.addEventListener('load', event => { if (event.target?.localName === 'script') installCookieFilter(); }, true);
        installCookieFilter();
    }

    let courseWindow = window;
    try { if (window.top.document) courseWindow = window.top; } catch (_) { /* 跨域课程页只使用当前框架的视频状态。 */ }
    const tabPlaybackKey = Symbol.for('cx-multi-video:tab-playback');
    const tabPlayback = courseWindow[tabPlaybackKey] ??= { playing: new Set(), endedAt: -Infinity };
    const startedHere = new Set();
    const manualPause = new WeakMap();
    function hasCoursePrompt(doc) {
        if (!doc?.querySelectorAll) return false;
        if (doc.querySelector('#freezePage2[isShow="true"], #freezePage[isShow="true"]')) return true;
        return [...doc.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], .ans-timelineobjects')]
            .some(el => el.getClientRects().length > 0 && doc.defaultView?.getComputedStyle(el).visibility === 'visible');
    }
    function markManualPause(event) {
        if (!event.isTrusted) return;
        const video = event.target.closest?.('.video-js')?.querySelector('video') ?? event.target;
        if (video instanceof HTMLVideoElement) manualPause.set(video, Date.now());
    }
    window.addEventListener('pointerdown', markManualPause, true);
    window.addEventListener('click', markManualPause, true);
    window.addEventListener('keydown', event => { if ([' ', 'Enter', 'k', 'MediaPlayPause', 'MediaPause'].includes(event.key)) markManualPause(event); }, true);

    const media = HTMLMediaElement.prototype;
    const nativePause = media.pause;
    let pageLeaving = false;
    media.pause = function pause() {
        const now = Date.now();
        if ((settings.multiVideo || settings.mouseLeave) && startedHere.has(this) && this.isConnected && !this.paused && !this.ended && !this.seeking && !this.error &&
            !pageLeaving && now - (manualPause.get(this) ?? -Infinity) >= 600 && !hasCoursePrompt(document) &&
            (courseWindow === window || !hasCoursePrompt(courseWindow.document))) {
            if (settings.mouseLeave && nativeHidden?.call(document)) return;
            if (settings.multiVideo) {
                if (now - tabPlayback.endedAt < 6000) return;
                for (const other of tabPlayback.playing) {
                    if (!other.isConnected || other.paused || other.ended || other.error) tabPlayback.playing.delete(other);
                    else if (other !== this) return;
                }
            }
        }
        return nativePause.call(this);
    };
    for (const type of ['pause', 'ended', 'emptied', 'error']) {
        window.addEventListener(type, event => {
            const video = event.target;
            if (!startedHere.has(video) || (type === 'pause' && !video.paused)) return;
            tabPlayback.playing.delete(video);
            if (type === 'ended') tabPlayback.endedAt = Date.now();
        }, true);
    }
    window.addEventListener('pagehide', () => {
        pageLeaving = true;
        for (const video of startedHere) tabPlayback.playing.delete(video);
        startedHere.clear();
    });
    window.addEventListener('pageshow', () => { pageLeaving = false; });

    const mutedSource = new WeakMap();
    window.addEventListener('play', event => {
        const video = event.target;
        if (!(video instanceof HTMLVideoElement)) return;
        installCookieFilter();
        startedHere.add(video); tabPlayback.playing.add(video); manualPause.delete(video);
        const source = video.currentSrc || video.src;
        if (!settings.autoMute || (mutedSource.has(video) && mutedSource.get(video) === source)) return;
        mutedSource.set(video, source); video.muted = true;
    }, true);

    if (window === window.top && /\/studentstudy\b/.test(location.pathname)) {
        let busy = false, cancelled = false, status, panel;
        const UI_POSITION_KEY = 'cx-multi-video-ui-position-v1';
        const watched = new WeakSet();
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const say = text => { console.info('[学习通网课插件]', text); if (status) status.textContent = text; };
        const videosIn = doc => {
            const videos = [...doc.querySelectorAll('video')];
            for (const frame of doc.querySelectorAll('iframe')) { try { if (frame.contentDocument) videos.push(...videosIn(frame.contentDocument)); } catch (_) {} }
            return videos;
        };
        const courseVideos = () => { const doc = document.querySelector('#iframe')?.contentDocument; return doc ? videosIn(doc) : []; };
        const snapshot = () => { const frame = document.querySelector('#iframe'); return { chapter: document.querySelector('#chapterIdid')?.value, src: frame?.getAttribute('src'), doc: frame?.contentDocument }; };
        async function nextOnce(step) {
            const before = snapshot(); const next = document.querySelector('#prevNextFocusNext');
            if (!visible(next) || next.getAttribute('aria-disabled') === 'true') throw new Error('找不到可用的下一节。');
            say(`正在点击第 ${step}/${settings.nextClicks} 次下一节`); next.click(); let confirmed = false; const deadline = Date.now() + 30000;
            while (Date.now() < deadline) {
                if (cancelled) throw new Error('已取消自动切换。');
                const confirm = [...document.querySelectorAll('.jobFinishTip .nextChapter, #jobFinishTip .nextChapter')].find(visible);
                if (confirm && !confirmed) { confirmed = true; confirm.click(); }
                const after = snapshot();
                if (after.doc && after.doc !== before.doc && after.doc.readyState === 'complete' && (after.chapter !== before.chapter || after.src !== before.src)) { await sleep(700); return; }
                await sleep(200);
            }
            throw new Error('等待下一节加载超时。');
        }
        async function playNextVideo() {
            const target = snapshot().doc; const deadline = Date.now() + 30000;
            while (Date.now() < deadline) {
                if (cancelled || snapshot().doc !== target) throw new Error('已取消新视频自动播放。');
                const video = courseVideos().find(v => !v.ended && (v.currentSrc || v.src));
                if (video) { video.muted = settings.autoMute; await video.play(); say(settings.autoMute ? '新视频已静音自动播放。' : '新视频已自动播放。'); return; }
                await sleep(200);
            }
            throw new Error('等待新视频超时。');
        }
        async function onEnded(video) {
            if (!settings.autoNext || busy || !video.ended) return;
            const videos = courseVideos(); if (!videos.includes(video) || videos.some(v => !v.ended)) return;
            busy = true; cancelled = false;
            const runRevision = settingsRevision;
            try {
                say('本页面视频已全部结束，准备切换');
                await sleep(3000);
                if (!settings.autoNext || settingsRevision !== runRevision) throw new Error('自动下一节已关闭。');
                for (let step = 1; step <= settings.nextClicks; step++) await nextOnce(step);
                await playNextVideo();
            }
            catch (error) { say(error.message); } finally { busy = false; }
        }

        function makeGithubIcon() {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
            svg.innerHTML = '<path fill="currentColor" d="M12 .7a11.3 11.3 0 0 0-3.57 22.02c.57.1.78-.25.78-.55v-2.04c-3.18.69-3.85-1.53-3.85-1.53-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.54-.29-5.2-1.27-5.2-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.03 0 0 .96-.31 3.12 1.17a10.75 10.75 0 0 1 5.68 0c2.16-1.48 3.12-1.17 3.12-1.17.62 1.58.23 2.74.11 3.03.73.8 1.18 1.82 1.18 3.07 0 4.39-2.67 5.35-5.21 5.64.41.36.78 1.07.78 2.16v3.2c0 .3.21.65.79.54A11.3 11.3 0 0 0 12 .7Z"/>'; return svg;
        }
        function refreshUi() {
            if (!panel) return;
            panel.querySelectorAll('[data-setting]').forEach(input => { const key = input.dataset.setting; if (input.type === 'checkbox') input.checked = Boolean(settings[key]); else input.value = String(settings[key]); });
            panel.querySelectorAll('.cx-switch').forEach(button => button.setAttribute('aria-checked', String(Boolean(settings[button.dataset.setting]))));
        }
        function readUiPosition() {
            try {
                const value = JSON.parse(localStorage.getItem(UI_POSITION_KEY) || 'null');
                return Number.isFinite(value?.left) && Number.isFinite(value?.top) ? value : null;
            } catch (_) { return null; }
        }
        let uiPosition = readUiPosition();
        function applyUiPosition(left, top, source) {
            const width = source?.offsetWidth || panel?.offsetWidth || 330;
            const height = source?.offsetHeight || panel?.offsetHeight || 80;
            const next = {
                left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
                top: Math.max(8, Math.min(window.innerHeight - height - 8, top))
            };
            uiPosition = next;
            for (const element of [panel, document.querySelector('#cx-glass-toggle')]) {
                if (!element) continue;
                element.style.left = `${next.left}px`;
                element.style.top = `${next.top}px`;
                element.style.right = 'auto';
                element.style.bottom = 'auto';
            }
            try { localStorage.setItem(UI_POSITION_KEY, JSON.stringify(next)); } catch (_) { /* 位置只保留在当前页面。 */ }
        }
        function createUi() {
            if (!document.body || panel) return;
            const style = document.createElement('style'); style.textContent = "#cx-glass-panel{position:fixed;right:24px;bottom:24px;width:330px;z-index:2147483647;color:#172033;font:14px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;letter-spacing:.01em;background:linear-gradient(135deg,rgba(255,255,255,.42),rgba(255,255,255,.16) 48%,rgba(225,238,255,.25));border:1px solid rgba(255,255,255,.72);border-radius:28px;box-shadow:0 24px 70px rgba(24,45,78,.28),0 2px 8px rgba(255,255,255,.6) inset,-1px -1px 12px rgba(255,255,255,.28) inset;backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);overflow:hidden;isolation:isolate}#cx-glass-panel:before{content:\"\";position:absolute;inset:-45%;z-index:-1;background:conic-gradient(from 210deg at 35% 35%,rgba(255,255,255,.55),rgba(153,203,255,.2),rgba(255,181,226,.2),rgba(255,255,255,.48));filter:blur(28px);opacity:.72;pointer-events:none}#cx-glass-panel:after{content:\"\";position:absolute;inset:0;z-index:-1;background:radial-gradient(circle at 12% 0,rgba(255,255,255,.72),transparent 32%),radial-gradient(circle at 100% 100%,rgba(122,181,255,.18),transparent 42%);pointer-events:none}#cx-glass-panel>*{position:relative}#cx-glass-panel header{display:flex;justify-content:space-between;align-items:center;padding:18px 18px 12px;cursor:grab;user-select:none}#cx-glass-panel header:active{cursor:grabbing}#cx-glass-panel h2{margin:0;color:#101a2d;font-size:16px;font-weight:700}#cx-glass-panel .cx-sub{margin:2px 0 0;color:#3f4d64;font-size:11px}.cx-body{padding:0 14px 15px}.cx-row{display:flex;align-items:center;justify-content:space-between;padding:11px 5px;border-top:1px solid rgba(37,57,87,.14)}.cx-row label{color:#172033;font-weight:560;cursor:pointer}.cx-switch{width:42px;height:25px;border:1px solid rgba(31,48,76,.18);border-radius:20px;background:rgba(39,59,89,.2);padding:2px;transition:.2s;cursor:pointer}.cx-switch:after{content:\"\";display:block;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(17,31,55,.28);transition:.2s}.cx-switch[aria-checked=\"true\"]{background:#1677e8;border-color:#1677e8}.cx-switch[aria-checked=\"true\"]:after{transform:translateX(17px)}#cx-glass-panel select{color:#172033;background:rgba(255,255,255,.48);border:1px solid rgba(31,48,76,.2);border-radius:10px;padding:5px 7px}#cx-glass-panel option{color:#111}.cx-tools{display:flex;gap:8px;margin-top:10px}.cx-tool{flex:1;border:1px solid rgba(31,48,76,.2);border-radius:12px;padding:8px 9px;background:rgba(255,255,255,.36);color:#172033;font-weight:600;cursor:pointer}.cx-tool:hover{background:rgba(255,255,255,.62)}.cx-github{display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}.cx-github svg{width:17px;height:17px}.cx-status{margin:10px 4px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.3);color:#33425a;font-size:12px;min-height:17px}#cx-glass-toggle{position:fixed;right:24px;bottom:24px;z-index:2147483647;display:none;border:1px solid rgba(255,255,255,.78);border-radius:50%;width:48px;height:48px;background:linear-gradient(135deg,rgba(255,255,255,.52),rgba(191,220,255,.28));color:#172033;box-shadow:0 14px 35px rgba(24,45,78,.25),inset 0 1px 5px rgba(255,255,255,.75);backdrop-filter:blur(18px) saturate(180%);-webkit-backdrop-filter:blur(18px) saturate(180%);cursor:grab;font-size:20px}#cx-glass-toggle:active{cursor:grabbing}"; document.head.append(style);
            panel = document.createElement('section'); panel.id = 'cx-glass-panel'; panel.setAttribute('aria-label', '学习通网课插件设置');
            panel.innerHTML = '<header><div><h2>学习通网课插件</h2><p class="cx-sub">开发者：zc360</p></div><button class="cx-tool" data-all>全部打开</button></header><div class="cx-body">' + [['mouseLeave','鼠标离开窗口检测'],['autoMute','自动静音'],['multiVideo','多视频同时播放'],['autoNext','自动点击下一节']].map(([key,label]) => `<div class="cx-row"><label>${label}</label><button class="cx-switch" type="button" role="switch" data-setting="${key}" aria-checked="false"></button></div>`).join('') + '<div class="cx-row"><label>下一节点击次数</label><select data-setting="nextClicks"><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option><option value="4">4 次</option><option value="5">5 次</option></select></div><div class="cx-tools"><a class="cx-tool cx-github" href="https://github.com/zc360/chaoxingxuexitong-automatic_script" target="_blank" rel="noopener noreferrer" aria-label="打开 GitHub 项目"></a><button class="cx-tool" data-hide>隐藏面板</button></div><div class="cx-status" data-status>设置已保存</div></div>';
            document.body.append(panel); const toggle = document.createElement('button'); toggle.id = 'cx-glass-toggle'; toggle.textContent = '⚙'; toggle.title = '打开设置'; document.body.append(toggle); panel.querySelector('.cx-github').prepend(makeGithubIcon());
            const initialPosition = uiPosition || { left: panel.getBoundingClientRect().left, top: panel.getBoundingClientRect().top };
            applyUiPosition(initialPosition.left, initialPosition.top, panel);
            const drag = (element, handle) => {
                let active = false, moved = false, startX = 0, startY = 0, originX = 0, originY = 0;
                const finish = event => {
                    if (!active) return;
                    active = false;
                    if (event?.pointerId != null) element.releasePointerCapture?.(event.pointerId);
                };
                handle.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    active = true; moved = false; startX = event.clientX; startY = event.clientY;
                    const rect = element.getBoundingClientRect(); originX = rect.left; originY = rect.top;
                    element.setPointerCapture?.(event.pointerId);
                });
                element.addEventListener('pointermove', event => {
                    if (!active) return;
                    if (event.buttons !== 1) { finish(event); return; }
                    const dx = event.clientX - startX; const dy = event.clientY - startY;
                    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
                    if (!moved) return;
                    applyUiPosition(originX + dx, originY + dy, element);
                });
                element.addEventListener('pointerup', finish);
                element.addEventListener('pointercancel', finish);
                window.addEventListener('pointerup', finish, true);
                window.addEventListener('pointercancel', finish, true);
                handle.addEventListener('click', event => { if (moved) { event.preventDefault(); event.stopImmediatePropagation(); moved = false; } }, true);
            };
            drag(panel, panel.querySelector('header')); drag(toggle, toggle);
            panel.querySelectorAll('.cx-switch').forEach(button => button.addEventListener('click', () => { const key = button.dataset.setting; saveSettings({ [key]: !settings[key] }); refreshUi(); }));
            panel.querySelector('[data-all]').addEventListener('click', event => {
                event.preventDefault();
                saveSettings({ mouseLeave: true, autoMute: true, multiVideo: true, autoNext: true });
                status.textContent = '全部功能已打开';
                refreshUi();
            });
            panel.querySelector('[data-hide]').addEventListener('click', () => { panel.style.display = 'none'; toggle.style.display = 'block'; }); toggle.addEventListener('click', () => { panel.style.display = 'block'; toggle.style.display = 'none'; });
            panel.querySelector('[data-setting="nextClicks"]').addEventListener('change', event => { saveSettings({ nextClicks: event.target.value }); refreshUi(); }); status = panel.querySelector('[data-status]'); refreshUi();
        }
        function scan() { createUi(); for (const video of courseVideos()) { if (watched.has(video)) continue; watched.add(video); video.addEventListener('ended', () => { void onEnded(video); }); } }
        scan(); setInterval(scan, 1000);
    }
})();
