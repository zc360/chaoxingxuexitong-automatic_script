# 学习通后台播放油猴脚本

脚本文件：`chaoxing-background.user.js` & `chaoxing-multi-video.user.js`

[GitHub仓库](https://github.com/zc360/chaoxingxuexitong-automatic_script)

[chaoxing-background.user.js Greasyfork地址](https://greasyfork.org/zh-CN/scripts/603744-%E5%AD%A6%E4%B9%A0%E9%80%9A-%E5%85%81%E8%AE%B8%E5%90%8E%E5%8F%B0%E6%92%AD%E6%94%BE%E4%B8%8E%E8%87%AA%E5%8A%A8%E6%92%AD%E6%94%BE%E4%B8%8B%E4%B8%AA%E8%A7%86%E9%A2%91%E4%BB%A5%E5%8F%8A%E8%87%AA%E5%8A%A8%E9%9D%99%E9%9F%B3)

[chaoxing-multi-video.user.js Greasyfork地址](https://greasyfork.org/zh-CN/scripts/607395-%E5%AD%A6%E4%B9%A0%E9%80%9A-%E5%A4%9A%E8%A7%86%E9%A2%91%E5%A4%9A%E7%AA%97%E5%8F%A3%E5%90%8C%E6%97%B6%E6%92%AD%E6%94%BE%E4%B8%8E%E5%8E%BB%E9%99%A4%E9%BC%A0%E6%A0%87%E7%A7%BB%E5%87%BA%E6%A3%80%E6%B5%8B)

## 如何使用（适用于GitHub用户）

1. 在 Edge / Chrome 安装官方扩展商店中的 Tampermonkey（篡改猴）。
2. 打开扩展面板 → 添加新脚本，将 `chaoxing-background.user.js` 全部内容粘贴进去，按 Ctrl+S 保存。
3. 回到课程页面刷新一次。左下角出现“后台播放保护已启用”后，手动点击视频播放。
4. 若扩展提示需要“允许用户脚本”，按 Tampermonkey 的提示开启，并允许扩展访问超星课程页面。

## 功能与行为（适用于`chaoxing-background.user.js`）

- 切换窗口、标签页或鼠标离开网页时，拦截相关离开事件，防止页面据此暂停视频；不会强制恢复你主动暂停的视频。
- 当前卡片内所有可读取的视频自然播放结束后，等待 3 秒，再顺序点击两次页面底部的“下一节”。每次都等待课程 iframe 加载完成。
- 若出现“当前章节还有任务点未完成”的章节切换提示，自动点击其中的“下一节”。确认弹窗内的点击不计入底部按钮的两次点击。
- **两次点击就是跨过两个卡片**：当前页面是“视频 → 章节测验 → 下一章”。这会离开测验，但不会答题或提交测验；测验任务仍须自己完成。只有一个卡片的章节可能因此越过下一章，请在倒计时期间点击左下角面板取消。
- 两次切换完成后，最多等待新播放器 30 秒，每次都会先设为静音，再自动播放新视频。你可以在播放器中手动开启声音；自动切换到下一个视频时会重新静音。若浏览器阻止自动播放，会提示手动播放。第一次进入课程仍需手动播放。
- 切换及等待新播放器过程中点击左下角状态面板，可取消尚未执行的操作。自动播放只在脚本换课后触发，主动暂停后不会被反复恢复播放。
- 找不到下一节、课程已结束或加载超时，会显示原因并停止，不会反复点击。

## 注意（适用于`chaoxing-background.user.js`）
- 脚本逻辑是自动点两下下一节，适用于一个视频+一个练习的课程，一个视频一节的课程会跳到下下个视频自动播放

## 功能与行为（适用于`chaoxing-multi-video.user.js`）
- 学习通多视频同时播放
- 切到后台保持播放
- 去除鼠标移出检测
- 新视频自动静音

## 注意（适用于`chaoxing-multi-video.user.js`）
- 支持同一标签页内多个视频和多个窗口不同标签页以及同一窗口多标签页播放
