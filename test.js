// ==UserScript==
// @name         中纪委审查调查/党纪处分信息提取
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  自动提取中纪委各类审查调查/党纪处分页面的标题和详情链接，复制到剪贴板
// @author       You
// @match        https://www.ccdi.gov.cn/scdcn/*/zjsc/*
// @match        https://www.ccdi.gov.cn/scdcn/*/djcf/*
// @match        https://www.ccdi.gov.cn/scdcn/*/zjsc/
// @match        https://www.ccdi.gov.cn/scdcn/*/djcf/
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 等待页面完全加载（document-idle后再延迟1秒，确保DOM完全渲染）
  setTimeout(() => {
    // 1. 获取目标列表容器
    const listContainer = document.querySelector('ul.list_news_dl2.fixed');
    if (!listContainer) {
      alert('未找到目标列表容器，请确认页面是否正确！');
      return;
    }

    // 2. 获取所有列表项
    const listItems = listContainer.querySelectorAll('li');
    const result = [];

    // 3. 遍历每个列表项提取信息
    listItems.forEach((item) => {
      // 获取title下的a标签
      const aTag = item.querySelector('.title a');
      if (!aTag) return;

      // 提取a标签文本（去除空格和换行）
      const titleText = aTag.textContent.trim().replace(/\s+/g, ' ');
      // 提取a标签的href属性
      const relativeHref = aTag.getAttribute('href');
      if (!relativeHref || !titleText) return;

      // 4. 修复链接拼接逻辑：彻底去除../，生成纯净完整链接
      let fullHref = '';
      if (relativeHref.startsWith('http')) {
        // 已经是完整链接，直接使用
        fullHref = relativeHref;
      } else {
        // 全局替换所有的../为空，彻底去除相对路径标识
        const cleanPath = relativeHref.replace(/\.{2}\//g, '');
        // 拼接根域名和纯净路径
        const baseUrl = 'https://www.ccdi.gov.cn';
        fullHref = `${baseUrl}/${cleanPath}`;
      }

      // 获取日期
      const timeTag = item.querySelector('.more');
      if (!timeTag) return;

      // 提取时间标签文本（去除空格和换行）
      const timeText = timeTag.textContent.trim().replace(/\s+/g, ' ');

      //级别，根据链接字符串区分
      const levelSpan = item.querySelector('.more span');
      const levelText = levelSpan ? levelSpan.textContent.trim() : '';

      // 5. 按指定格式整理
      const formattedStr = `中纪委\t${titleText}\t${timeText}\t${fullHref}`;
      result.push(formattedStr);
    });

    // 6. 复制到剪贴板
    if (result.length > 0) {
      const resultText = result.join('\n');
      // 使用GM_setClipboard复制（油猴内置API，更稳定）
      GM_setClipboard(resultText);
      alert(`✅ 成功提取${result.length}条信息！\n信息已复制到剪贴板。`);
    } else {
      alert('⚠️ 未提取到任何有效信息！');
    }
  }, 1000); // 延迟1秒执行，确保页面元素完全加载
})();