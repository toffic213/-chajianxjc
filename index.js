(function () {
  'use strict';

  const PLUGIN_ID = 'stage-theater';
  const ROOT_ID = 'stg-root';
  const STORAGE_KEY = 'stage_theater_settings_v1';
  const VERSION = '1.0.0';
  const icon = {
    masks: '<svg viewBox="0 0 24 24"><path d="M4 8c2-2 5-2 8 0 3-2 6-2 8 0v4c0 4-3 7-8 8-5-1-8-4-8-8V8z"/><path d="M8 12h.01M16 12h.01M9 16c2 1 4 1 6 0"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    cog: '<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .59V20a2 2 0 1 1-4 0v-.01a1.7 1.7 0 0 0-1-.59 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.59-1H4a2 2 0 1 1 0-4h.01a1.7 1.7 0 0 0 .59-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.59V4a2 2 0 1 1 4 0v.01a1.7 1.7 0 0 0 1 .59 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.35.44.67.59 1H20a2 2 0 1 1 0 4h-.01a1.7 1.7 0 0 0-.59 1z"/></svg>',
    api: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    hist: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 16v5h5"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 8V3h-5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>'
  };

  const defaults = {
    globalEnabled: true, autoGenerate: false, chatEnabledDefault: true,
    contextDepth: 10, contextPreset: '10', sendWorldInfo: false,
    sendCharacterCard: true, includeLastUser: true, promptMode: 'merged',
    renderScripts: false, activeProfileId: 'default', fab: { right: 22, bottom: 92 },
    profiles: [{ id: 'default', name: '默认档案', baseUrl: '', apiKey: '', model: '', temperature: 0.9, maxTokens: 800, stream: false }],
    prompts: [{ id: makeId(), name: '默认小剧场', category: '通用', note: '可改成你自己的风格要求。', enabled: true, text: '请根据刚刚的角色回复，生成一个短小剧场。要求：贴合角色卡设定、贴合当前对话气氛；可以使用 HTML 做分区和基础排版；不要复述原文；输出只包含小剧场正文。' }]
  };

  let settings = loadSettings();
  let ready = false;
  let busy = false;
  let lastSignature = '';
  let pendingSignature = '';
  let pendingSince = 0;
  let drag = null;

  function makeId() { return 'stg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function ctx() { try { return window.SillyTavern?.getContext?.() || {}; } catch (_) { return {}; } }
  function extSettings() { const c = ctx(); return c.extensionSettings || window.extension_settings || null; }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } }
  function html(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function attr(v) { return html(v).replace(/`/g, '&#96;'); }
  function css(v) { return window.CSS?.escape ? window.CSS.escape(String(v)) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  function hash(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return String(h >>> 0); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function loadSettings() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}
    try { if (!stored) stored = extSettings()?.[PLUGIN_ID]; } catch (_) {}
    const s = Object.assign(clone(defaults), stored || {});
    s.profiles = Array.isArray(stored?.profiles) && stored.profiles.length ? stored.profiles : clone(defaults.profiles);
    s.prompts = Array.isArray(stored?.prompts) && stored.prompts.length ? stored.prompts : clone(defaults.prompts);
    s.fab = Object.assign({}, defaults.fab, stored?.fab || {});
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { console.warn('[stage-theater] local save failed', e); }
    try {
      const store = extSettings();
      if (store) store[PLUGIN_ID] = clone(settings);
      const c = ctx();
      c.saveSettingsDebounced?.();
      window.saveSettingsDebounced?.();
      window.saveSettings?.();
    } catch (e) { console.warn('[stage-theater] settings save failed', e); }
  }

  function chatStore() {
    const c = ctx();
    c.chatMetadata ||= {};
    c.chatMetadata.extensions ||= {};
    c.chatMetadata.extensions[PLUGIN_ID] ||= { chatEnabled: settings.chatEnabledDefault, theaters: {} };
    const s = c.chatMetadata.extensions[PLUGIN_ID];
    s.theaters ||= {};
    if (typeof s.chatEnabled !== 'boolean') s.chatEnabled = settings.chatEnabledDefault;
    return s;
  }

  function saveChat() {
    const c = ctx();
    try { c.saveChat?.(); } catch (_) {}
    try { window.saveChatConditional?.(); } catch (_) {}
    try { window.saveChat?.(); } catch (_) {}
    try { c.saveMetadata?.(); } catch (_) {}
    try { window.saveMetadataDebounced?.(); } catch (_) {}
    try { window.insertOrAssignVariables?.({ [PLUGIN_ID]: c.chatMetadata?.extensions?.[PLUGIN_ID] }, { type: 'chat' }); } catch (_) {}
  }

  function init() {
    if (ready) return;
    ready = true;
    mount();
    bind();
    restoreWindows();
    subscribe();
    status('准备好了。先填 API，再启用自动生成。');
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = [
      '<button class="stg-fab" data-stg-action="toggle" title="小剧场生成器">' + icon.masks + '</button>',
      '<section class="stg-panel" data-stg-panel><div class="stg-panel-head"><div><div class="stg-title">小剧场生成器</div><div class="stg-subtle">v' + VERSION + ' · 独立 API</div></div><button class="stg-icon-btn" data-stg-action="close" title="关闭">' + icon.close + '</button></div>',
      '<div class="stg-tabs">' + tab('general', icon.cog, 1, '总控') + tab('api', icon.api, 0, 'API') + tab('prompts', icon.file, 0, '提示词') + tab('history', icon.hist, 0, '历史收藏') + tab('run', icon.play, 0, '手动生成') + '</div>',
      '<div class="stg-body"><div class="stg-section stg-active" data-stg-section="general"></div><div class="stg-section" data-stg-section="api"></div><div class="stg-section" data-stg-section="prompts"></div><div class="stg-section" data-stg-section="history"></div><div class="stg-section" data-stg-section="run"></div><div class="stg-status" data-stg-status></div></div></section>'
    ].join('');
    document.body.appendChild(root);
    placeFab();
    renderAll();
  }

  function tab(id, svg, active, title) { return '<button class="stg-tab ' + (active ? 'stg-active' : '') + '" data-stg-tab="' + id + '" title="' + title + '">' + svg + '</button>'; }
  function bind() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('input', onInput, true);
    const fab = document.querySelector('#' + ROOT_ID + ' .stg-fab');
    fab?.addEventListener('pointerdown', down);
    fab?.addEventListener('pointermove', move);
    fab?.addEventListener('pointerup', up);
    fab?.addEventListener('pointercancel', up);
  }

  function down(e) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, right: settings.fab.right, bottom: settings.fab.bottom, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function move(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const fab = e.currentTarget;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    settings.fab.right = clamp(drag.right - dx, 8, Math.max(8, innerWidth - fab.offsetWidth - 8));
    settings.fab.bottom = clamp(drag.bottom - dy, 8, Math.max(8, innerHeight - fab.offsetHeight - 8));
    placeFab();
  }
  function up(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const clicked = !drag.moved;
    drag = null;
    saveSettings();
    if (clicked) togglePanel();
  }
  function placeFab() {
    const fab = document.querySelector('#' + ROOT_ID + ' .stg-fab');
    const panel = document.querySelector('#' + ROOT_ID + ' [data-stg-panel]');
    if (fab) { fab.style.right = settings.fab.right + 'px'; fab.style.bottom = settings.fab.bottom + 'px'; }
    if (panel) { panel.style.right = Math.max(12, settings.fab.right) + 'px'; panel.style.bottom = Math.max(72, settings.fab.bottom + 58) + 'px'; }
  }

  function onClick(e) {
    const tabEl = e.target?.closest?.('[data-stg-tab]');
    const act = e.target?.closest?.('[data-stg-action]');
    const tact = e.target?.closest?.('[data-stg-theater-action]');
    const root = document.getElementById(ROOT_ID);
    if (tabEl && root?.contains(tabEl)) { e.preventDefault(); e.stopPropagation(); setTab(tabEl.dataset.stgTab); return; }
    if (act && (root?.contains(act) || act.closest('.stg-theater-window'))) { e.preventDefault(); e.stopPropagation(); action(act.dataset.stgAction, act); return; }
    if (tact) { e.preventDefault(); e.stopPropagation(); theaterAction(tact.dataset.stgTheaterAction, tact); }
  }
  function onChange(e) {
    const el = e.target;
    if (el?.dataset?.stgAction === 'importPrompts') return importPrompts(el);
    if (el?.matches?.('[data-stg-setting],[data-stg-profile],[data-stg-prompt-field]')) field(el);
  }
  function onInput(e) {
    const el = e.target;
    if (!el?.matches?.('[data-stg-setting],[data-stg-profile],[data-stg-prompt-field]') || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    field(el);
  }

  function togglePanel(force) {
    const p = document.querySelector('#' + ROOT_ID + ' [data-stg-panel]');
    if (!p) return;
    p.classList.toggle('stg-open', typeof force === 'boolean' ? force : !p.classList.contains('stg-open'));
    if (p.classList.contains('stg-open')) renderAll();
  }
  function setTab(name) {
    document.querySelectorAll('#' + ROOT_ID + ' [data-stg-tab]').forEach(b => b.classList.toggle('stg-active', b.dataset.stgTab === name));
    document.querySelectorAll('#' + ROOT_ID + ' [data-stg-section]').forEach(s => s.classList.toggle('stg-active', s.dataset.stgSection === name));
    render(name);
  }
  function renderAll() { ['general', 'api', 'prompts', 'history', 'run'].forEach(render); }
  function render(name) {
    const el = document.querySelector('#' + ROOT_ID + ' [data-stg-section="' + name + '"]');
    if (!el) return;
    if (name === 'general') el.innerHTML = generalHtml();
    if (name === 'api') el.innerHTML = apiHtml();
    if (name === 'prompts') el.innerHTML = promptsHtml();
    if (name === 'history') el.innerHTML = historyHtml();
    if (name === 'run') el.innerHTML = '<div class="stg-grid"><div class="stg-subtle">手动使用最后一条正常 AI 回复生成小剧场。</div><button class="stg-action stg-primary" data-stg-action="manual">' + icon.play + '生成最后一条</button><button class="stg-action" data-stg-action="restore">' + icon.refresh + '恢复当前聊天显示窗</button></div>';
  }
  function row(label, body) { return '<div class="stg-row"><div class="stg-label">' + html(label) + '</div>' + body + '</div>'; }
  function sw(key, label, hint, checked, chat) { return '<div class="stg-row-inline"><div><div class="stg-label">' + html(label) + '</div><div class="stg-subtle">' + html(hint) + '</div></div><label class="stg-switch"><input type="checkbox" data-stg-setting="' + attr(key) + '"' + (chat ? ' data-stg-chat-setting="1"' : '') + (checked ? ' checked' : '') + '><span class="stg-slider"></span></label></div>'; }
  function sel(key, val, opts, data) { return '<select class="stg-select" ' + (data || 'data-stg-setting') + '="' + attr(key) + '">' + opts.map(o => '<option value="' + attr(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + html(o[1]) + '</option>').join('') + '</select>'; }
  function generalHtml() {
    const s = chatStore();
    return '<div class="stg-grid">' +
      sw('globalEnabled', '插件总开关', '关闭后所有自动/手动生成都会停用。', settings.globalEnabled) +
      sw('autoGenerate', 'AI 回复后自动生成', '默认关闭，避免刚安装就消耗 API。', settings.autoGenerate) +
      sw('chatEnabled', '当前聊天启用', '只影响当前聊天记录。', s.chatEnabled, true) +
      sw('sendCharacterCard', '发送角色卡设定', '会尽力读取角色名、描述、性格、场景等字段。', settings.sendCharacterCard) +
      sw('sendWorldInfo', '发送已启用世界书条目', '能读取到多少发多少，读取不到则跳过。', settings.sendWorldInfo) +
      sw('includeLastUser', '始终发送用户上一条消息', '上下文深度为 0 时也会发送上一条用户消息。', settings.includeLastUser) +
      row('上下文快捷深度', sel('contextPreset', settings.contextPreset, [['0', '不发送'], ['5', '最近 5 条'], ['10', '最近 10 条'], ['20', '最近 20 条'], ['custom', '手动输入']])) +
      row('手动上下文条数', '<input class="stg-input" data-stg-setting="contextDepth" type="number" min="0" max="80" value="' + Number(settings.contextDepth || 0) + '">') +
      row('多提示词模式', sel('promptMode', settings.promptMode, [['merged', '合并一次生成'], ['separate', '每条分别生成']])) +
      sw('renderScripts', '危险：沙盒渲染脚本', '关闭时保留 HTML 但不执行脚本；打开后用 iframe sandbox 渲染。', settings.renderScripts) +
      '</div>';
  }
  function profile() {
    let p = settings.profiles.find(x => x.id === settings.activeProfileId);
    if (!p) { p = settings.profiles[0]; settings.activeProfileId = p.id; }
    return p;
  }
  function apiInput(k, label, type, step) { const p = profile(); return row(label, '<input class="stg-input" data-stg-profile="' + k + '" type="' + (type || 'text') + '"' + (step ? ' step="' + step + '"' : '') + ' value="' + attr(p[k] ?? '') + '">'); }
  function apiHtml() {
    const p = profile();
    return '<div class="stg-grid">' +
      row('当前 API 档案', sel('activeProfileId', settings.activeProfileId, settings.profiles.map(x => [x.id, x.name || '未命名档案']))) +
      '<div class="stg-button-row"><button class="stg-action" data-stg-action="addProfile">' + icon.file + '新增档案</button><button class="stg-action" data-stg-action="delProfile">' + icon.trash + '删除档案</button><button class="stg-action" data-stg-action="models">' + icon.refresh + '获取模型</button></div>' +
      apiInput('name', '档案名') + apiInput('baseUrl', 'API 地址') + apiInput('apiKey', 'API Key', 'password') + apiInput('model', '模型名称') + apiInput('temperature', '温度', 'number', '0.1') + apiInput('maxTokens', '最大输出长度', 'number', '1') +
      sw('profile.stream', '流式输出', '部分模型流式更稳定，可自行切换。', !!p.stream) +
      '<button class="stg-action stg-primary" data-stg-action="test">' + icon.play + '测试生成</button></div>';
  }
  function promptsHtml() {
    return '<div class="stg-grid"><div class="stg-button-row"><button class="stg-action stg-primary" data-stg-action="addPrompt">' + icon.file + '新增提示词</button><button class="stg-action" data-stg-action="exportPrompts">' + icon.copy + '导出</button><label class="stg-action">' + icon.save + '导入<input class="stg-hidden" type="file" accept="application/json" data-stg-action="importPrompts"></label></div><div class="stg-list">' + (settings.prompts.map(promptCard).join('') || '<div class="stg-subtle">还没有提示词。</div>') + '</div></div>';
  }
  function promptCard(p, i) {
    return '<div class="stg-card" data-stg-prompt-id="' + attr(p.id) + '"><div class="stg-card-head"><div class="stg-card-name">' + html(p.name || '未命名提示词') + '</div><span class="stg-pill">' + html(p.category || '未分类') + '</span></div>' +
      '<div class="stg-row-inline"><span class="stg-label">启用</span><label class="stg-switch"><input type="checkbox" data-stg-prompt-field="enabled"' + (p.enabled ? ' checked' : '') + '><span class="stg-slider"></span></label></div>' +
      pInput('name', '名称', p.name) + pInput('category', '分类', p.category) + pInput('note', '备注', p.note) +
      '<div class="stg-row"><div class="stg-label">正文</div><textarea class="stg-textarea" data-stg-prompt-field="text">' + html(p.text || '') + '</textarea></div>' +
      '<div class="stg-button-row"><button class="stg-icon-btn" data-stg-action="pUp" title="上移"' + (i === 0 ? ' disabled' : '') + '>' + icon.up + '</button><button class="stg-icon-btn" data-stg-action="pDown" title="下移"' + (i === settings.prompts.length - 1 ? ' disabled' : '') + '>' + icon.down + '</button><button class="stg-icon-btn" data-stg-action="pCopy" title="复制提示词">' + icon.copy + '</button><button class="stg-icon-btn" data-stg-action="pDel" title="删除提示词">' + icon.trash + '</button></div></div>';
  }
  function pInput(k, label, value) { return row(label, '<input class="stg-input" data-stg-prompt-field="' + k + '" value="' + attr(value || '') + '">'); }
  function historyHtml() {
    const s = chatStore();
    const all = Object.entries(s.theaters || {}).flatMap(([messageKey, d]) => [d.current && Object.assign({ messageKey, current: true }, d.current)].concat((d.favorites || []).map(f => Object.assign({ messageKey, current: false }, f))).filter(Boolean)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return '<div class="stg-grid">' + (all.map(x => '<div class="stg-card"><div class="stg-card-head"><div class="stg-card-name">' + html(x.title || '小剧场') + '</div><span class="stg-pill">' + (x.current ? '当前' : '收藏') + '</span></div><div class="stg-subtle">消息 ' + html(x.messageKey) + '</div><button class="stg-action" data-stg-action="jump" data-message-key="' + attr(x.messageKey) + '">' + icon.play + '定位</button></div>').join('') || '<div class="stg-subtle">当前聊天还没有小剧场。</div>') + '</div>';
  }

  function field(el) {
    if (el.dataset.stgChatSetting) { chatStore().chatEnabled = !!el.checked; saveChat(); status('当前聊天开关已保存。'); return; }
    if (el.dataset.stgSetting) {
      const k = el.dataset.stgSetting;
      if (k === 'profile.stream') profile().stream = !!el.checked;
      else if (el.type === 'checkbox') settings[k] = !!el.checked;
      else if (k === 'contextDepth') { settings.contextDepth = Math.max(0, Number(el.value || 0)); settings.contextPreset = 'custom'; }
      else { settings[k] = el.value; if (k === 'contextPreset' && el.value !== 'custom') settings.contextDepth = Number(el.value || 0); }
      saveSettings(); renderAll(); return;
    }
    if (el.dataset.stgProfile) {
      const k = el.dataset.stgProfile;
      profile()[k] = (k === 'temperature' || k === 'maxTokens') ? Number(el.value || 0) : el.value;
      saveSettings(); return;
    }
    if (el.dataset.stgPromptField) {
      const p = settings.prompts.find(x => x.id === el.closest('[data-stg-prompt-id]')?.dataset.stgPromptId);
      if (!p) return;
      p[el.dataset.stgPromptField] = el.type === 'checkbox' ? !!el.checked : el.value;
      saveSettings();
      if (['name', 'category'].includes(el.dataset.stgPromptField)) render('prompts');
    }
  }

  function action(name, el) {
    if (name === 'toggle') return;
    if (name === 'close') return togglePanel(false);
    if (name === 'addProfile') { const p = { id: makeId(), name: '新档案', baseUrl: '', apiKey: '', model: '', temperature: 0.9, maxTokens: 800, stream: false }; settings.profiles.push(p); settings.activeProfileId = p.id; saveSettings(); renderAll(); }
    if (name === 'delProfile') { if (settings.profiles.length <= 1) return status('至少保留一个 API 档案。'); settings.profiles = settings.profiles.filter(p => p.id !== settings.activeProfileId); settings.activeProfileId = settings.profiles[0].id; saveSettings(); renderAll(); }
    if (name === 'models') return getModels();
    if (name === 'test') return testApi();
    if (name === 'addPrompt') { settings.prompts.push({ id: makeId(), name: '新小剧场', category: '通用', note: '', enabled: true, text: '' }); saveSettings(); render('prompts'); }
    if (name === 'pCopy') return promptCopy(el);
    if (name === 'pDel') return promptDel(el);
    if (name === 'pUp') return promptMove(el, -1);
    if (name === 'pDown') return promptMove(el, 1);
    if (name === 'exportPrompts') return exportPrompts();
    if (name === 'importPrompts') return importPrompts(el);
    if (name === 'manual') return manual();
    if (name === 'restore') return restoreWindows();
    if (name === 'jump') return jump(el.dataset.messageKey);
  }
  function promptByEl(el) { return el.closest('[data-stg-prompt-id]')?.dataset.stgPromptId; }
  function promptCopy(el) { const p = settings.prompts.find(x => x.id === promptByEl(el)); if (!p) return; settings.prompts.push(Object.assign({}, clone(p), { id: makeId(), name: (p.name || '提示词') + ' 副本' })); saveSettings(); render('prompts'); }
  function promptDel(el) { settings.prompts = settings.prompts.filter(p => p.id !== promptByEl(el)); saveSettings(); render('prompts'); }
  function promptMove(el, d) { const i = settings.prompts.findIndex(p => p.id === promptByEl(el)); const j = i + d; if (i < 0 || j < 0 || j >= settings.prompts.length) return; [settings.prompts[i], settings.prompts[j]] = [settings.prompts[j], settings.prompts[i]]; saveSettings(); render('prompts'); }
  function exportPrompts() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, prompts: settings.prompts }, null, 2)], { type: 'application/json' })); a.download = 'stage-theater-prompts.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  async function importPrompts(input) {
    const file = input.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : data.prompts;
      if (!Array.isArray(arr)) throw new Error('bad json');
      const clean = arr.map(p => ({ id: makeId(), name: String(p.name || '导入提示词'), category: String(p.category || '导入'), note: String(p.note || ''), enabled: p.enabled !== false, text: String(p.text || p.prompt || '') })).filter(p => p.text.trim());
      settings.prompts.push(...clean); saveSettings(); render('prompts'); status('已导入 ' + clean.length + ' 条提示词。');
    } catch (_) { status('导入失败：JSON 格式不对。'); }
    input.value = '';
  }

  function subscribe() {
    const c = ctx(), es = c.eventSource || window.eventSource, types = c.event_types || window.event_types || {};
    const events = [types.MESSAGE_RECEIVED, types.MESSAGE_UPDATED, types.GENERATION_ENDED].filter(Boolean);
    if (es?.on) events.concat(events.length ? [] : ['message_received', 'message_updated', 'generation_ended']).forEach(n => { try { es.on(n, () => setTimeout(() => maybeAuto(n), 350)); } catch (_) {} });
    setInterval(() => maybeAuto('poll'), 2500);
  }
  function chat() { return Array.isArray(ctx().chat) ? ctx().chat : []; }
  function keyOf(i, m) { return String(m?.id ?? m?.swipe_id ?? m?.send_date ?? m?.gen_id ?? i); }
  function lastAssistant() {
    const arr = chat();
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i] || {};
      if (m.is_user || m.role === 'user' || m.role === 'system' || m.is_system) continue;
      const text = String(m.mes ?? m.content ?? '').trim();
      if (text) return { index: i, key: keyOf(i, m), message: m, text };
    }
    return null;
  }
  async function maybeAuto(source) {
    if (busy || !settings.globalEnabled || !settings.autoGenerate || !chatStore().chatEnabled) return;
    const m = lastAssistant();
    if (!m || m.message?.is_incomplete || m.message?.interrupted || /^(error|exception|failed|network error|api error)[:：]/i.test(m.text)) return;
    const sig = m.key + ':' + hash(m.text);
    if (sig === lastSignature) return;
    if (sig !== pendingSignature) {
      pendingSignature = sig;
      pendingSince = Date.now();
      return;
    }
    if (Date.now() - pendingSince < 700) return;
    lastSignature = sig;
    await generate(m, source);
  }
  async function manual() { const m = lastAssistant(); if (!m) return status('没有找到可用的 AI 回复。'); await generate(m, 'manual'); }

  async function generate(msg, source) {
    if (!settings.globalEnabled) return status('插件总开关关闭。');
    if (!chatStore().chatEnabled) return status('当前聊天开关关闭。');
    const p = profile();
    const prompts = settings.prompts.filter(x => x.enabled && String(x.text || '').trim());
    if (!p.baseUrl || !p.apiKey || !p.model) return status('请先配置 API 地址、密钥和模型。');
    if (!prompts.length) return status('请至少启用一条小剧场提示词。');
    busy = true;
    const store = chatStore();
    const old = store.theaters[msg.key] || { favorites: [] };
    store.theaters[msg.key] = { current: { id: makeId(), title: '小剧场生成中', content: '正在生成小剧场...', status: 'loading', createdAt: Date.now() }, favorites: old.favorites || [] };
    renderWindow(msg, store.theaters[msg.key]);
    status('正在生成小剧场...');
    try {
      let content = '';
      if (settings.promptMode === 'separate' && prompts.length > 1) {
        const sections = [];
        for (const prompt of prompts) {
          const req = buildRequest(msg, [prompt]);
          let part = '';
          if (p.stream) {
            part = await requestStream(p, req.system, req.user, delta => {
              part += delta;
              const live = chatStore().theaters[msg.key];
              if (live?.current) {
                const preview = sections.join('') + '<section><h3>' + html(prompt.name || '小剧场') + '</h3>' + part + '</section>';
                live.current.content = preview;
                renderWindow(msg, live);
              }
            });
          } else {
            part = await requestOnce(p, req.system, req.user);
          }
          if (part) sections.push('<section><h3>' + html(prompt.name || '小剧场') + '</h3>' + part + '</section>');
        }
        content = sections.join('');
      } else {
        const req = buildRequest(msg, prompts);
        if (p.stream) content = await requestStream(p, req.system, req.user, d => {
          content += d;
          const live = chatStore().theaters[msg.key];
          if (live?.current) {
            live.current.content = content || '正在生成小剧场...';
            renderWindow(msg, live);
          }
        });
        else content = await requestOnce(p, req.system, req.user);
      }
      if (!content) throw new Error('空响应');
      const fresh = { id: makeId(), title: prompts.length === 1 ? prompts[0].name : '合并小剧场 · ' + prompts.length + ' 条提示词', content, promptNames: prompts.map(x => x.name), sourceHash: hash(msg.text), source, createdAt: Date.now(), status: 'done' };
      const now = chatStore().theaters[msg.key] || { favorites: [] };
      chatStore().theaters[msg.key] = { current: fresh, favorites: now.favorites || [] };
      saveChat(); renderWindow(msg, chatStore().theaters[msg.key]); render('history'); status('小剧场生成完成。');
    } catch (e) {
      const s = chatStore().theaters[msg.key] || { favorites: [] };
      s.current = Object.assign({}, s.current, { title: '生成失败', content: '生成失败：' + (e.message || '请求异常'), status: 'error' });
      chatStore().theaters[msg.key] = s; renderWindow(msg, s); status('生成失败：' + (e.message || '请求异常'));
    } finally { busy = false; }
  }

  function buildRequest(msg, prompts) {
    const promptBlock = prompts.map((p, i) => '【小剧场提示词 ' + (i + 1) + '：' + (p.name || '未命名') + '】\n分类：' + (p.category || '无') + '\n备注：' + (p.note || '无') + '\n' + p.text).join('\n\n');
    const mode = settings.promptMode === 'separate' ? '如果有多条提示词，请分别生成对应小剧场，并用清晰 HTML 区块分隔。' : '如果有多条提示词，请合并理解成一次任务，生成一个完整回复；需要多个小剧场时，请自行分区并美化 HTML。';
    const system = ['你是“小剧场生成器”。你只根据用户提供的材料，为聊天中的最新 AI 回复生成额外小剧场。', '必须贴合角色卡设定、当前对话、用户上一条消息和可选世界书。', '可以输出基础 HTML 标签用于排版，例如 div、section、details、summary、p、br、strong、em、ul、li、blockquote。', '不要解释任务，不要输出安全声明，不要复述输入材料。', mode, '以下是用户启用的小剧场提示词：\n' + promptBlock].join('\n\n');
    const parts = [];
    const char = settings.sendCharacterCard ? characterCard() : '';
    const world = settings.sendWorldInfo ? worldInfo() : '';
    const context = contextBlock(msg.index);
    const user = settings.includeLastUser ? lastUserBefore(msg.index) : '';
    if (char) parts.push('【角色卡设定】\n' + char);
    if (world) parts.push('【已启用世界书条目】\n' + world);
    if (context) parts.push('【最近聊天上下文】\n' + context);
    if (user) parts.push('【用户上一条消息】\n' + user);
    parts.push('【触发小剧场的 AI 回复】\n' + msg.text);
    parts.push('请现在生成小剧场正文。');
    return { system, user: parts.join('\n\n') };
  }
  function contextBlock(last) {
    const depth = Math.max(0, Number(settings.contextDepth || 0)); if (!depth) return '';
    return chat().slice(Math.max(0, last - depth + 1), last + 1).map(m => (m.is_user || m.role === 'user' ? '用户' : (m.role === 'system' || m.is_system ? '系统' : 'AI')) + (m.name ? '（' + m.name + '）' : '') + '：' + String(m.mes ?? m.content ?? '').trim()).join('\n');
  }
  function lastUserBefore(i) { const arr = chat(); for (let n = i - 1; n >= 0; n--) if (arr[n]?.is_user || arr[n]?.role === 'user') return String(arr[n].mes ?? arr[n].content ?? '').trim(); return ''; }
  function characterCard() {
    const c = ctx();
    const card = [c.character, c.characters?.[c.characterId], c.characters?.[c.this_chid], window.characters?.[window.this_chid], c.char].find(Boolean) || {};
    return [['角色名', card.name || c.name2 || window.name2], ['描述', card.description || card.desc], ['性格', card.personality], ['场景', card.scenario], ['第一条消息', card.first_mes || card.firstMessage], ['示例对话', card.mes_example || card.example_dialogue], ['备注', card.creator_notes || card.creatorNotes]].filter(x => x[1]).map(x => x[0] + '：' + String(x[1]).trim()).join('\n\n').slice(0, 12000);
  }
  function worldInfo() {
    const c = ctx(), pools = [c.world_info, c.worldInfo, c.worlds, window.world_info, window.worldInfo].filter(Boolean), out = [];
    const walk = v => {
      if (!v || out.length > 80) return;
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v === 'object') {
        const disabled = v.disable === true || v.disabled === true || v.enabled === false;
        const content = v.content || v.entry || v.text;
        if (content && !disabled) out.push('【' + String(v.comment || v.name || v.key || '世界书条目').slice(0, 80) + '】\n' + String(content).trim());
        else Object.values(v).forEach(walk);
      }
    };
    pools.forEach(walk);
    return out.join('\n\n').slice(0, 18000);
  }

  function urls(base, path) {
    base = String(base || '').replace(/\/+$/, '');
    if (!base) return [];
    return /\/v1$/i.test(base) ? [base + path, base.replace(/\/v1$/i, '') + path] : [base + path, base + '/v1' + path];
  }
  function headers(p) { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.apiKey }; }
  function body(p, system, user, stream) { return JSON.stringify({ model: p.model, temperature: Number(p.temperature ?? 0.9), max_tokens: Number(p.maxTokens ?? 800), stream: !!stream, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }); }
  async function requestOnce(p, system, user) {
    for (const url of urls(p.baseUrl, '/chat/completions')) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
      try { const r = await fetch(url, { method: 'POST', headers: headers(p), body: body(p, system, user, false), signal: ctl.signal }); if (r.ok) { const d = await r.json(); return d?.choices?.[0]?.message?.content || d?.choices?.[0]?.text || ''; } } catch (_) {} finally { clearTimeout(timer); }
    }
    return '';
  }
  async function requestStream(p, system, user, onDelta) {
    for (const url of urls(p.baseUrl, '/chat/completions')) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 90000);
      try {
        const r = await fetch(url, { method: 'POST', headers: headers(p), body: body(p, system, user, true), signal: ctl.signal });
        if (!r.ok || !r.body) continue;
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buffer = '', full = '';
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          for (const line of lines) {
            const s = line.trim(); if (!s.startsWith('data:')) continue;
            const payload = s.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
            try { const d = JSON.parse(payload); const delta = d?.choices?.[0]?.delta?.content || d?.choices?.[0]?.text || ''; if (delta) { full += delta; onDelta?.(delta); } } catch (_) {}
          }
        }
        return full;
      } catch (_) {} finally { clearTimeout(timer); }
    }
    return '';
  }
  async function getModels() {
    const p = profile(); status('正在获取模型列表...');
    for (const url of urls(p.baseUrl, '/models')) {
      try {
        const r = await fetch(url, { headers: headers(p) });
        if (!r.ok) continue;
        const ids = (await r.json())?.data?.map?.(m => m.id).filter(Boolean) || [];
        if (ids.length) { if (!p.model) p.model = ids[0]; saveSettings(); render('api'); return status('模型列表：' + ids.slice(0, 12).join(', ') + (ids.length > 12 ? ' ...' : '')); }
      } catch (_) {}
    }
    status('模型列表获取失败，请检查 API 地址和密钥。');
  }
  async function testApi() { const text = await requestOnce(profile(), '你是连接测试助手。', '请只回复：小剧场 API 连接正常。'); status(text ? '测试成功：' + text.slice(0, 80) : '测试失败，请检查配置。'); }

  function restoreWindows() {
    const s = chatStore();
    chat().forEach((m, i) => { if (m.is_user || m.role === 'user' || m.role === 'system' || m.is_system) return; const key = keyOf(i, m); if (s.theaters?.[key]?.current) renderWindow({ index: i, key, message: m, text: String(m.mes ?? m.content ?? '') }, s.theaters[key]); });
    render('history');
  }
  function messageEl(index, text) {
    let el = document.querySelector('[mesid="' + index + '"], [data-message-id="' + index + '"]');
    if (el) return el;
    const all = Array.from(document.querySelectorAll('#chat .mes, .mes'));
    if (all[index]) return all[index];
    const needle = String(text || '').slice(0, 60).trim();
    return needle ? all.reverse().find(x => (x.textContent || '').includes(needle)) || null : null;
  }
  function renderWindow(msg, data) {
    const anchor = messageEl(msg.index, msg.text); if (!anchor) return;
    let host = anchor.querySelector(':scope > .stg-theater-host');
    if (!host) { host = document.createElement('div'); host.className = 'stg-theater-host'; anchor.appendChild(host); }
    const current = data.current || {}, favs = data.favorites || [];
    host.innerHTML = '<div class="stg-theater-window" data-message-key="' + attr(msg.key) + '"><div class="stg-theater-head"><div class="stg-theater-title">' + icon.masks + '<span>' + html(current.title || '小剧场') + '</span></div><div class="stg-theater-tools">' + tbtn('collapse', icon.down, '折叠') + tbtn('regen', icon.refresh, '重新生成') + tbtn('fav', icon.star, '收藏') + tbtn('copy', icon.copy, '复制') + tbtn('edit', icon.edit, '编辑') + tbtn('del', icon.trash, '删除此条') + '</div></div>' + (favs.length ? '<div class="stg-fav-strip">' + favs.map((f, i) => '<button class="stg-fav-chip" data-stg-theater-action="showFav" data-fav-index="' + i + '">' + html(f.title || ('收藏 ' + (i + 1))) + '</button>').join('') + '</div>' : '') + '<div class="stg-theater-body"></div></div>';
    renderContent(host.querySelector('.stg-theater-body'), current.content || '');
  }
  function tbtn(a, svg, title) { return '<button class="stg-icon-btn" data-stg-theater-action="' + a + '" title="' + title + '">' + svg + '</button>'; }
  function renderContent(el, content) {
    if (!el) return;
    if (settings.renderScripts) { const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.srcdoc = '<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.58;color:#17212b;padding:10px;margin:0}img{max-width:100%}</style>' + String(content || ''); el.replaceChildren(frame); return; }
    const tpl = document.createElement('template'); tpl.innerHTML = String(content || '');
    tpl.content.querySelectorAll('script,iframe,object,embed,link,meta').forEach(x => x.remove());
    tpl.content.querySelectorAll('*').forEach(x => [...x.attributes].forEach(a => { if (a.name.toLowerCase().startsWith('on') || /javascript:/i.test(a.value)) x.removeAttribute(a.name); }));
    el.innerHTML = tpl.innerHTML;
  }
  function theaterAction(name, el) {
    const win = el.closest('.stg-theater-window'), key = win?.dataset.messageKey, s = chatStore(), d = s.theaters?.[key]; if (!key || !d) return;
    if (name === 'collapse') return win.classList.toggle('stg-collapsed');
    if (name === 'regen') return regen(key);
    if (name === 'fav') { d.favorites ||= []; d.favorites.unshift(Object.assign({}, clone(d.current), { id: makeId(), favoritedAt: Date.now(), title: (d.current?.title || '小剧场') + ' 收藏' })); saveChat(); restoreWindows(); return status('已收藏当前小剧场。'); }
    if (name === 'copy') return navigator.clipboard?.writeText(d.current?.content || '').then(() => status('已复制。'), () => status('复制失败，当前环境不允许访问剪贴板。'));
    if (name === 'edit') return edit(win, key);
    if (name === 'del') { delete s.theaters[key]; saveChat(); win.closest('.stg-theater-host')?.remove(); render('history'); return status('已删除此条小剧场。'); }
    if (name === 'showFav') { const fav = d.favorites?.[Number(el.dataset.favIndex || 0)]; if (fav) { d.current = Object.assign({}, clone(fav), { restoredAt: Date.now() }); saveChat(); restoreWindows(); } }
  }
  function regen(key) { const arr = chat(); for (let i = 0; i < arr.length; i++) if (keyOf(i, arr[i]) === key) return generate({ index: i, key, message: arr[i], text: String(arr[i].mes ?? arr[i].content ?? '') }, 'regenerate'); status('没找到原消息，无法重新生成。'); }
  function edit(win, key) {
    const d = chatStore().theaters[key], bodyEl = win.querySelector('.stg-theater-body');
    bodyEl.innerHTML = '<textarea class="stg-edit-box">' + html(d.current?.content || '') + '</textarea><div class="stg-button-row" style="margin-top:8px"><button class="stg-action stg-primary" data-save-edit>' + icon.save + '保存编辑</button></div>';
    bodyEl.querySelector('[data-save-edit]').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); d.current.content = bodyEl.querySelector('textarea').value; d.current.editedAt = Date.now(); saveChat(); restoreWindows(); status('编辑已保存。'); }, { once: true });
  }
  function jump(key) { document.querySelector('.stg-theater-window[data-message-key="' + css(key) + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  function status(text) { const el = document.querySelector('#' + ROOT_ID + ' [data-stg-status]'); if (el) el.textContent = text || ''; console.log('[stage-theater]', text); }

  const fire = () => { try { init(); } catch (e) { console.warn('[stage-theater] init failed', e); } };
  const c = ctx(), es = c.eventSource || window.eventSource, types = c.event_types || window.event_types || {};
  if (es?.on && types.APP_READY) { try { es.on(types.APP_READY, fire); } catch (_) {} }
  const start = Date.now();
  const timer = setInterval(() => {
    if (window.extension_settings || window.SillyTavern || document.body || Date.now() - start > 3500) {
      clearInterval(timer);
      fire();
    }
  }, 250);
})();
