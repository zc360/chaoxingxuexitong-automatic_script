// ==UserScript==
// @name         学习通：多视频多窗口同时播放与去除鼠标移出检测
// @namespace    local.chaoxing.multi-video
// @version      1.4.6
// @description  学习通多视频同时播放（仅适用于同一标签页内多个视频和多个窗口不同标签页，不能同一窗口多标签页播放），切到后台保持播放，去除鼠标移出检测，新视频自动静音。
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

    if (window.__cxBackgroundInstalled) return;
    window.__cxBackgroundInstalled = true;

    const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')?.get;

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

    const playerFrame = /\/ananas\/modules\/video\/index\.html$/.test(location.pathname);
    let cookieReader;
    function installCookieFilter() {
        if (!playerFrame) return;
        const ext = window.Ext;
        const original = ext?.getCookie;
        if (typeof original !== 'function' || original === cookieReader) return;
        // 已启动的 studyControl 定时器仍会从 Ext 读取这个播放器标识。
        cookieReader = function (name) {
            if (name === 'videojs_id') return undefined;
            return original.apply(this, arguments);
        };
        ext.getCookie = cookieReader;
    }
    if (playerFrame) {
        window.addEventListener('load', event => {
            if (event.target?.localName === 'script') installCookieFilter();
        }, true);
        installCookieFilter();
    }

    let courseWindow = window;
    try {
        if (window.top.document) courseWindow = window.top;
    } catch (_) { /* 跨域课程页只使用当前框架的视频状态。 */ }
    const key = Symbol.for('cx-multi-video:tab-playback');
    const tabPlayback = courseWindow[key] ??= { playing: new Set(), endedAt: -Infinity };
    const startedHere = new Set();
    const manualPause = new WeakMap();

    function hasCoursePrompt(doc) {
        if (doc.querySelector('#freezePage2[isShow="true"], #freezePage[isShow="true"]')) return true;
        return [...doc.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], .ans-timelineobjects')]
            .some(el => el.getClientRects().length > 0 && doc.defaultView.getComputedStyle(el).visibility === 'visible');
    }

    function markManualPause(event) {
        if (!event.isTrusted) return;
        const video = event.target.closest?.('.video-js')?.querySelector('video') ?? event.target;
        if (video instanceof HTMLVideoElement) manualPause.set(video, Date.now());
    }
    window.addEventListener('pointerdown', markManualPause, true);
    window.addEventListener('click', markManualPause, true);
    window.addEventListener('keydown', event => {
        if ([' ', 'Enter', 'k', 'MediaPlayPause', 'MediaPause'].includes(event.key)) markManualPause(event);
    }, true);

    const media = HTMLMediaElement.prototype;
    const nativePause = media.pause;
    let pageLeaving = false;
    media.pause = function pause() {
        const now = Date.now();
        if (startedHere.has(this) && this.isConnected && !this.paused && !this.ended && !this.seeking && !this.error &&
            !pageLeaving && now - (manualPause.get(this) ?? -Infinity) >= 600 &&
            !hasCoursePrompt(document) && (courseWindow === window || !hasCoursePrompt(courseWindow.document))) {
            if (nativeHidden?.call(document) || now - tabPlayback.endedAt < 6000) return;
            for (const other of tabPlayback.playing) {
                if (!other.isConnected || other.paused || other.ended || other.error) tabPlayback.playing.delete(other);
                else if (other !== this) return;
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
        startedHere.add(video);
        tabPlayback.playing.add(video);
        manualPause.delete(video);
        const source = video.currentSrc || video.src;
        if (mutedSource.has(video) && mutedSource.get(video) === source) return;
        mutedSource.set(video, source);
        video.muted = true;
    }, true);
})();
