// ==UserScript==
// @name         学习通：后台播放与结束后下一节两次
// @namespace    local.chaoxing.background
// @version      1.2.0
// @description  防止失焦暂停；视频结束后点击两次下一节、确认章节提示，并静音自动播放新视频。
// @match        https://*.chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mooc-ans/mycourse/studentstudy*
// @match        https://*.chaoxing.com/knowledge/cards*
// @match        https://*.chaoxing.com/mooc-ans/knowledge/cards*
// @match        https://*.chaoxing.com/ananas/modules/video/index.html*
// @match        https://*.chaoxing.com/mooc-ans/ananas/modules/video/index.html*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
    'use strict';

    if (window.__cxBackgroundInstalled) return;
    window.__cxBackgroundInstalled = true;

    // 提前在页面自身的 JS 环境运行，拦截页面离开事件，保留输入框失焦和内部鼠标移动。
    const leaving = event => {
        if (event.type === 'blur' && event.target !== window && event.target !== document) return;
        if ((event.type === 'mouseout' || event.type === 'pointerout') && event.relatedTarget) return;
        if ((event.type === 'mouseleave' || event.type === 'pointerleave') &&
            ![window, document, document.documentElement, document.body].includes(event.target)) return;
        event.stopImmediatePropagation();
    };
    for (const type of ['blur', 'visibilitychange', 'webkitvisibilitychange',
        'mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
        window.addEventListener(type, leaving, true);
    }
    for (const [name, value] of Object.entries({
        hidden: false, webkitHidden: false, visibilityState: 'visible', webkitVisibilityState: 'visible'
    })) {
        Object.defineProperty(document, name, { configurable: true, get: () => value });
    }
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });

    // 子框架只负责防失焦；下一节操作集中在课程主页面，避免多层框架重复点击。
    if (window !== window.top || !/\/studentstudy\b/.test(location.pathname)) return;

    let busy = false;
    let cancelled = false;
    let status;
    const watched = new WeakSet();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = el => !!el && el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden';
    const say = text => {
        console.info('[学习通后台播放]', text);
        if (status) status.textContent = text;
    };

    function videosIn(doc) {
        const videos = [...doc.querySelectorAll('video')];
        for (const frame of doc.querySelectorAll('iframe')) {
            try {
                if (frame.contentDocument) videos.push(...videosIn(frame.contentDocument));
            } catch (_) { /* 跨域框架不可读取，不尝试绕过浏览器的跨域限制。 */ }
        }
        return videos;
    }

    function courseVideos() {
        const doc = document.querySelector('#iframe')?.contentDocument;
        return doc ? videosIn(doc) : [];
    }

    function snapshot() {
        const frame = document.querySelector('#iframe');
        return {
            chapter: document.querySelector('#chapterIdid')?.value,
            src: frame?.getAttribute('src'),
            doc: frame?.contentDocument
        };
    }

    async function nextOnce(step) {
        if (cancelled) throw new Error('已取消自动切换。');
        const before = snapshot();
        const next = document.querySelector('#prevNextFocusNext');
        if (!visible(next) || next.getAttribute('aria-disabled') === 'true') {
            throw new Error('找不到可用的下一节，已停止自动切换。');
        }
        say(`正在点击第 ${step}/2 次下一节（点击面板可取消）`);
        next.click();
        let confirmed = false;
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            if (cancelled) throw new Error('已取消自动切换。');
            // 只确认已核对的章节切换提示，不点击测验提交、验证码或其他弹窗。
            const confirm = [...document.querySelectorAll(
                '.jobFinishTip .nextChapter, #jobFinishTip .nextChapter'
            )].find(visible);
            if (confirm && !confirmed) {
                confirmed = true;
                confirm.click();
            }
            const after = snapshot();
            if (after.doc && after.doc !== before.doc &&
                after.doc.readyState === 'complete' &&
                (after.chapter !== before.chapter || after.src !== before.src)) {
                await sleep(700);
                return;
            }
            await sleep(200);
        }
        throw new Error('等待下一节加载超时，已停止；请检查页面后手动继续。');
    }

    async function playNewVideo() {
        const target = snapshot().doc;
        const deadline = Date.now() + 30000;
        say('已完成两次下一节，正在等待新视频（点击面板可取消）');
        while (Date.now() < deadline) {
            if (cancelled || snapshot().doc !== target) throw new Error('已取消新视频自动播放。');
            const video = courseVideos().find(v => !v.ended && (v.currentSrc || v.src));
            if (video) {
                scan(); // 播放前绑定结束监听，让下一段视频也能自动换课。
                video.muted = true;
                try {
                    await video.play();
                    say('新视频已静音自动播放，可在播放器中开启声音。');
                } catch (error) {
                    if (error.name === 'NotAllowedError') throw new Error('浏览器阻止自动播放，请手动点击播放。');
                    throw new Error('新视频播放失败，请手动播放。');
                }
                return;
            }
            await sleep(200);
        }
        throw new Error('等待新视频超时，请检查页面后手动播放。');
    }

    async function onEnded(video) {
        const videos = courseVideos();
        if (busy || !video.ended || !videos.includes(video) || videos.some(v => !v.ended)) return;
        busy = true;
        cancelled = false;
        const initial = snapshot();
        try {
            say('视频已结束，3 秒后切换（点击面板可取消）');
            await sleep(3000); // 给播放器留出正常保存进度的时间。
            if (cancelled) throw new Error('已取消自动切换。');
            if (snapshot().doc !== initial.doc || videos.some(v => !v.ended)) {
                throw new Error('视频或卡片已改变，已取消本次切换。');
            }
            await nextOnce(1);
            await nextOnce(2);
            await playNewVideo();
        } catch (error) {
            say(error.message);
        } finally {
            busy = false;
        }
    }

    function scan() {
        if (!document.body) return;
        if (!status) {
            status = document.createElement('button');
            status.type = 'button';
            status.title = '切换过程中点击可取消后续操作；停用脚本并刷新可恢复页面原行为';
            status.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;' +
                'padding:8px 12px;background:#17364d;color:white;border:0;border-radius:6px;' +
                'font:13px sans-serif;cursor:pointer;max-width:460px';
            status.addEventListener('click', () => {
                if (busy) { cancelled = true; say('正在取消后续切换……'); }
            });
            document.body.append(status);
            say('后台播放保护已启用；请手动播放视频');
        }
        for (const video of courseVideos()) {
            if (watched.has(video)) continue;
            watched.add(video);
            video.addEventListener('ended', () => { void onEnded(video); });
        }
    }
    scan();
    setInterval(scan, 1000);
})();
