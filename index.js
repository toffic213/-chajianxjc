(() => {
  'use strict';

  const PLUGIN_ID = 'stage-theater';
  const STORAGE_KEY = `${PLUGIN_ID}:settings`;
  const ROOT_ID = 'stt-root';
  const DEFAULT_SETTINGS = {
    enabled: true,
    autoTrigger: true,
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.85,
    maxTokens: 600,
    contextDepth: 8,
    includeWorldbook: false,
    includeContext: true,
    activeSceneIds: ['default-aftertaste'],
    scenes: [
      { id: 'default-aftertaste', name: '余韵旁白', prompt: '用第三人称写一段紧接当前回复的短小剧场，补充角色没有说出口的情绪。', enabled: true },
      { id: 'default-cast', name: '幕后花絮', prompt: '让当前场景中的角色进行一小段轻松的幕后花絮对话，不改变主线事实。', enabled: false },
    ],
  };

  let settings = null;
  let ctx = null;
  let root = null;
  let generationBusy = false;
  let lastHandledMessage = '';
  let triggerTimer = null;

  const svg = {
    theater: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H4z"/><path d="M8 20h8M9 16l-2 4M15 16l2 4M8 8l2 2 2-3 2 3 2-2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };

  function getContext() {
    try { return window.SillyTavern?.getContext?.() || {}; } catch { return {}; }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readSettings() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { stored = {}; }
    const tavern = window.extension_settings?.[PLUGIN_ID] || {};
    const merged = { ...clone(DEFAULT_SETTINGS), ...tavern, ...stored };
    merged.scenes = Array.isArray(merged.scenes) ? merged.scenes : clone(DEFAULT_SETTINGS.scenes);
    merged.activeSceneIds = Array.isArray(merged.activeSceneIds) ? merged.activeSceneIds : [];
    return merged;
  }

  function persistSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (error) { console.warn('[stage-theater] localStorage unavailable', error); }
    try {
      if (window.extension_settings) window.extension_settings[PLUGIN_ID] = settings;
      const save = window.saveSettingsDebounced || window.saveSettings;
      if (typeof save === 'function') save();
    } catch (error) { console.warn('[stage-theater] settings save failed', error); }
  }

  function chatMessages() {
    return Array.isArray(ctx?.chat) ? ctx.chat : [];
  }

  function lastAiMessage() {
    const messages = chatMessages();
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.is_user || message?.role === 'system') continue;
      const text = String(message?.mes ?? message?.content ?? '').trim();
      if (text) return text;
    }
    return '';
  }

  function contextText() {
    if (!settings.includeContext) return '';
    return chatMessages().slice(-Math.max(1, Number(settings.contextDepth) || 1)).map((message) => {
      const role = message?.is_user ? '用户' : message?.role === 'system' ? '系统' : 'AI';
      return `${role}: ${String(message?.mes ?? message?.content ?? '').trim()}`;
    }).filter(Boolean).join('\n');
  }

  function worldbookText() {
    if (!settings.includeWorldbook) return '';
    const candidates = [ctx?.worldInfo, ctx?.worldbook, ctx?.worldBook, ctx?.chatMetadata?.worldInfo, ctx?.chatMetadata?.worldbook, window.worldInfo];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === 'string') return candidate;
      try {
        const text = JSON.stringify(candidate);
        if (text && text !== '{}') return text;
      } catch { /* ignore incompatible worldbook objects */ }
    }
    return '';
  }

  function activeScenes() {
    const selected = new Set(settings.activeSceneIds || []);
    return settings.scenes.filter((scene) => scene.enabled !== false && selected.has(scene.id));
  }

  function selectedScenesForRequest() {
    const scenes = activeScenes();
    return scenes.length ? scenes : settings.scenes.filter((scene) => scene.enabled !== false).slice(0, 1);
  }

  function endpointCandidates() {
    const base = String(settings.baseUrl || '').replace(/\/+$/, '');
    if (!base) return [];
    const result = [base];
    if (!/\/v1$/i.test(base)) result.push(`${base}/v1`);
    return [...new Set(result)].map((item) => `${item}/chat/completions`);
  }

  async function askLlm(systemPrompt, userContent) {
    if (!settings.apiKey || !settings.baseUrl || !settings.model) {
      throw new Error('请先填写 API 地址、密钥和模型。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      let lastError = null;
      for (const endpoint of endpointCandidates()) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
            body: JSON.stringify({
              model: settings.model,
              temperature: Number(settings.temperature) || 0.85,
              max_tokens: Number(settings.maxTokens) || 600,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
            }),
            signal: controller.signal,
          });
          if (!response.ok) { lastError = new Error(`API HTTP ${response.status}`); continue; }
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content.trim()) return content.trim();
          lastError = new Error('API 没有返回正文。');
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error('API 请求失败。');
    } finally { clearTimeout(timer); }
  }

  function saveChatData(data) {
    try {
      ctx.chatMetadata = ctx.chatMetadata || {};
      ctx.chatMetadata.extensions = ctx.chatMetadata.extensions || {};
      ctx.chatMetadata.extensions[PLUGIN_ID] = data;
      const save = ctx.saveChat || window.saveChatConditional || window.saveChat || ctx.saveMetadata || window.saveMetadataDebounced;
      if (typeof save === 'function') save.call(ctx);
    } catch (error) { console.warn('[stage-theater] chat save failed', error); }
  }

  function scenePayload(scene, reply) {
    const context = contextText();
    const worldbook = worldbookText();
    const chunks = [`当前 AI 回复：\n${reply}`];
    if (context) chunks.push(`可参考的最近对话：\n${context}`);
    if (worldbook) chunks.push(`已启用世界书内容（仅作背景，不要复述设置）：\n${worldbook}`);
    return chunks.join('\n\n');
  }

  async function generateTheater(force = false) {
    if (generationBusy || !settings.enabled) return;
    const reply = lastAiMessage();
    if (!reply) { setStatus('当前还没有可用的 AI 回复。'); return; }
    if (!force && reply === lastHandledMessage) return;
    const scenes = selectedScenesForRequest();
    generationBusy = true;
    setStatus('正在生成小剧场…');
    try {
      const results = [];
      for (const scene of scenes) {
        const system = `你是酒馆聊天中的“小剧场”编剧。${scene.prompt}\n只输出剧场正文，不要解释写作过程，不要改变既有事实。控制在 300 字以内。`;
        const result = await askLlm(system, scenePayload(scene, reply));
        results.push(`【${scene.name}】\n${result}`);
      }
      lastHandledMessage = reply;
      const output = results.join('\n\n');
      saveChatData({ lastOutput: output, updatedAt: Date.now(), sourceMessage: reply.slice(0, 160) });
      renderOutput(output);
      setStatus(`已生成 ${results.length} 条小剧场`);
    } catch (error) {
      console.warn('[stage-theater] generation failed', error);
      setStatus(error?.message || '生成失败，请检查 API 设置。');
    } finally { generationBusy = false; }
  }

  function setStatus(text) {
    const element = root?.querySelector('[data-stt-status]');
    if (element) element.textContent = text;
  }

  function positionPanel() {
    const fab = root?.querySelector('.stt-fab');
    const panel = root?.querySelector('[data-stt-panel]');
    if (!fab || !panel) return;
    const rect = fab.getBoundingClientRect();
    const width = Math.min(390, window.innerWidth - 28);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(10, Math.min(window.innerWidth - width - 10, rect.right - width))}px`;
    const panelHeight = Math.min(panel.scrollHeight || 500, window.innerHeight - 145);
    const above = rect.top - panelHeight - 10;
    panel.style.top = `${above >= 10 ? above : Math.min(window.innerHeight - panelHeight - 10, rect.bottom + 10)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function renderOutput(text) {
    const element = root?.querySelector('[data-stt-output]');
    if (element) element.textContent = text || '尚未生成。';
  }

  function sceneHtml(scene) {
    const checked = settings.activeSceneIds.includes(scene.id) ? ' checked' : '';
    return `<div class="stt-scene" data-scene-id="${escapeHtml(scene.id)}"><label><input type="checkbox" data-action="toggle-scene"${checked}> ${escapeHtml(scene.name)}</label><small>${escapeHtml(scene.prompt)}</small><div class="stt-actions"><button class="stt-btn" data-action="edit-scene">编辑</button><button class="stt-btn stt-btn-danger" data-action="delete-scene" title="删除此场景">${svg.trash}</button></div></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function panelHtml() {
    return `<button class="stt-fab" data-action="toggle-panel" aria-label="打开小剧场面板" title="打开小剧场面板">${svg.theater}</button>
      <section class="stt-panel" data-stt-panel hidden>
        <div class="stt-head"><div><div class="stt-title">小剧场</div><div class="stt-status" data-stt-status>就绪</div></div><button class="stt-btn stt-icon-btn" data-action="close-panel" aria-label="关闭">${svg.close}</button></div>
        <div class="stt-section"><label class="stt-check"><input type="checkbox" data-setting="enabled"> 启用插件</label><label class="stt-check"><input type="checkbox" data-setting="autoTrigger"> AI 回复后自动生成</label><div class="stt-actions"><button class="stt-btn stt-btn-primary" data-action="generate">${svg.play} 立即生成</button></div></div>
        <div class="stt-section"><div class="stt-title-row"><strong>小剧场库</strong><div class="stt-actions"><button class="stt-btn" data-action="import-preset">导入文件</button><button class="stt-btn" data-action="paste-preset">粘贴 JSON</button><input class="stt-hidden" type="file" accept=".json,application/json" data-stt-preset-file><button class="stt-btn stt-icon-btn" data-action="add-scene" aria-label="添加场景" title="添加场景">${svg.plus}</button></div></div><div class="stt-muted">勾选一条或多条；每条会独立调用一次 API。</div><div class="stt-scene-list" data-stt-scenes></div></div>
        <div class="stt-section"><strong>上下文</strong><label class="stt-check"><input type="checkbox" data-setting="includeContext"> 发送最近对话</label><label class="stt-label">上下文条数</label><input type="number" min="1" max="50" data-setting="contextDepth"><label class="stt-check"><input type="checkbox" data-setting="includeWorldbook"> 发送已启用世界书（若当前壳提供）</label></div>
        <div class="stt-section"><strong>独立 API</strong><label class="stt-label">API 地址（可填根地址或带 /v1）</label><input type="text" data-setting="baseUrl" placeholder="https://api.example.com/v1"><label class="stt-label">API 密钥</label><input type="password" data-setting="apiKey" placeholder="sk-..."><label class="stt-label">模型</label><input type="text" data-setting="model" placeholder="模型名称"><div class="stt-grid"><div><label class="stt-label">温度</label><input type="number" min="0" max="2" step="0.05" data-setting="temperature"></div><div><label class="stt-label">最大输出</label><input type="number" min="64" max="8000" step="32" data-setting="maxTokens"></div></div><div class="stt-actions"><button class="stt-btn" data-action="save-settings">${svg.save} 保存设置</button></div></div>
        <div class="stt-section"><strong>最近输出</strong><div class="stt-output" data-stt-output>尚未生成。</div></div>
      </section>`;
  }

  function renderScenes() {
    const list = root?.querySelector('[data-stt-scenes]');
    if (list) list.innerHTML = settings.scenes.map(sceneHtml).join('');
  }

  function syncSettingsUi() {
    root?.querySelectorAll('[data-setting]').forEach((element) => {
      const key = element.dataset.setting;
      if (element.type === 'checkbox') element.checked = Boolean(settings[key]);
      else element.value = settings[key] ?? '';
    });
    renderScenes();
  }

  function addScene() {
    const name = window.prompt('场景名称', '新小剧场');
    if (!name) return;
    const prompt = window.prompt('告诉 AI 这一条小剧场要怎么写', '写一段 200 字以内的番外，不改变主线事实。');
    if (!prompt) return;
    const scene = { id: `scene-${Date.now()}`, name: name.trim(), prompt: prompt.trim(), enabled: true };
    settings.scenes.push(scene);
    settings.activeSceneIds.push(scene.id);
    persistSettings();
    renderScenes();
  }

  function deleteScene(element) {
    const id = element.closest('[data-scene-id]')?.dataset.sceneId;
    settings.scenes = settings.scenes.filter((scene) => scene.id !== id);
    settings.activeSceneIds = settings.activeSceneIds.filter((sceneId) => sceneId !== id);
    persistSettings();
    renderScenes();
  }

  function editScene(element) {
    const id = element.closest('[data-scene-id]')?.dataset.sceneId;
    const scene = settings.scenes.find((item) => item.id === id);
    if (!scene) return;
    const name = window.prompt('场景名称', scene.name);
    if (!name) return;
    const prompt = window.prompt('告诉 AI 这一条小剧场要怎么写', scene.prompt);
    if (!prompt) return;
    scene.name = name.trim();
    scene.prompt = prompt.trim();
    persistSettings();
    renderScenes();
  }

  function importPresetValue(value) {
    const entries = Array.isArray(value) ? value : Array.isArray(value?.prompts) ? value.prompts : Array.isArray(value?.entries) ? value.entries : Array.isArray(value?.items) ? value.items : [value];
    const usable = entries.filter((item) => item && (item.name || item.title || item.prompt || item.system_prompt || item.content || item.text || item.value));
    if (!usable.length) throw new Error('没有找到可导入的条目。');
    let chosen = usable;
    if (usable.length > 1) {
      const hint = usable.map((item, index) => `${index + 1}. ${String(item.name || item.title || '预设条目')}`).join('\n');
      const selection = window.prompt(`选择要入库的预设条目（输入编号，如 1,3；直接回车导入全部）\n${hint}`, '');
      if (selection === null) return;
      const indexes = selection.trim() ? selection.split(',').map((part) => Number(part.trim()) - 1).filter((index) => Number.isInteger(index) && index >= 0 && index < usable.length) : usable.map((_, index) => index);
      chosen = indexes.map((index) => usable[index]).filter(Boolean);
    }
    let imported = 0;
    chosen.forEach((item) => {
      const scene = { id: `scene-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: String(item.name || item.title || item.identifier || '预设条目'), prompt: String(item.prompt || item.system_prompt || item.content || item.text || item.value || ''), enabled: true };
      settings.scenes.push(scene);
      settings.activeSceneIds.push(scene.id);
      imported += 1;
    });
    if (!imported) throw new Error('没有找到可导入的条目。');
    persistSettings();
    renderScenes();
    setStatus(`已导入 ${imported} 条预设。`);
  }

  function importPreset() {
    const fileInput = root?.querySelector('[data-stt-preset-file]');
    if (fileInput) { fileInput.value = ''; fileInput.click(); return; }
    const raw = window.prompt('粘贴预设条目 JSON（单个对象或数组，字段可用 name/prompt）');
    if (!raw) return;
    try {
      importPresetValue(JSON.parse(raw));
    } catch (error) { setStatus(error?.message || '预设 JSON 格式不正确。'); }
  }

  function pastePreset() {
    const raw = window.prompt('粘贴预设条目 JSON（单个对象或数组，字段可用 name/prompt/content）');
    if (!raw) return;
    try { importPresetValue(JSON.parse(raw)); } catch (error) { setStatus(error?.message || '预设 JSON 格式不正确。'); }
  }

  function bindUi() {
    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const action = target.dataset.action;
      if (action === 'toggle-panel') {
        const panel = root.querySelector('[data-stt-panel]');
        panel.hidden = !panel.hidden;
        if (!panel.hidden) positionPanel();
      }
      if (action === 'close-panel') root.querySelector('[data-stt-panel]').hidden = true;
      if (action === 'generate') generateTheater(true);
      if (action === 'add-scene') addScene();
      if (action === 'import-preset') importPreset();
      if (action === 'paste-preset') pastePreset();
      if (action === 'delete-scene') deleteScene(target);
      if (action === 'edit-scene') editScene(target);
      if (action === 'save-settings') { persistSettings(); setStatus('设置已保存。'); }
    });
    root.addEventListener('change', (event) => {
      const setting = event.target.closest('[data-setting]');
      if (setting) {
        const key = setting.dataset.setting;
        settings[key] = setting.type === 'checkbox' ? setting.checked : setting.type === 'number' ? Number(setting.value) : setting.value;
        persistSettings();
      }
      if (event.target.matches('[data-action="toggle-scene"]')) {
        const id = event.target.closest('[data-scene-id]')?.dataset.sceneId;
        settings.activeSceneIds = event.target.checked ? [...new Set([...settings.activeSceneIds, id])] : settings.activeSceneIds.filter((item) => item !== id);
        persistSettings();
      }
      if (event.target.matches('[data-stt-preset-file]')) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { try { importPresetValue(JSON.parse(String(reader.result || ''))); } catch (error) { setStatus(error?.message || '预设 JSON 格式不正确。'); } };
        reader.onerror = () => setStatus('读取预设文件失败。');
        reader.readAsText(file);
      }
    });
    bindDrag(root.querySelector('.stt-fab'));
  }

  function bindDrag(fab) {
    if (!fab) return;
    let pointer = null;
    let suppressClick = false;
    fab.addEventListener('pointerdown', (event) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; fab.setPointerCapture?.(event.pointerId); });
    fab.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 6) pointer.moved = true;
      if (!pointer.moved) return;
      fab.style.left = `${Math.max(4, Math.min(window.innerWidth - fab.offsetWidth - 4, event.clientX - fab.offsetWidth / 2))}px`;
      fab.style.top = `${Math.max(4, Math.min(window.innerHeight - fab.offsetHeight - 4, event.clientY - fab.offsetHeight / 2))}px`;
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    fab.addEventListener('pointerup', () => { suppressClick = Boolean(pointer?.moved); pointer = null; });
    fab.addEventListener('click', (event) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } });
  }

  function mount() {
    if (!document.body) throw new Error('页面主体尚未准备好');
    if (document.getElementById(ROOT_ID)) return;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = panelHtml();
    document.body.appendChild(root);
    syncSettingsUi();
    bindUi();
    const imported = ctx?.chatMetadata?.extensions?.[PLUGIN_ID]?.lastOutput;
    if (imported) renderOutput(imported);
  }

  function onMessageReceived() {
    if (!settings.autoTrigger || !settings.enabled) return;
    window.clearTimeout(triggerTimer);
    triggerTimer = window.setTimeout(() => generateTheater(false), 450);
  }

  function init() {
    settings = readSettings();
    ctx = getContext();
    mount();
    const source = ctx.eventSource || window.eventSource;
    const types = ctx.event_types || window.event_types || {};
    const eventName = types.MESSAGE_RECEIVED ?? types.MESSAGE_UPDATED ?? types.GENERATION_STARTED;
    if (source?.on && eventName != null) source.on(eventName, onMessageReceived);
  }

  let initialized = false;
  function fire() {
    if (initialized || !document.body) return;
    try { init(); initialized = true; } catch (error) { console.warn('[stage-theater] init failed; retrying', error); }
  }
  try {
    const early = getContext();
    if (early.eventSource && early.event_types?.APP_READY != null) early.eventSource.on(early.event_types.APP_READY, fire);
  } catch { /* polling fallback below */ }
  const startedAt = Date.now();
  const interval = window.setInterval(() => {
    if (initialized) { window.clearInterval(interval); return; }
    if (document.body && (window.SillyTavern || window.extension_settings || Date.now() - startedAt > 15000)) fire();
  }, 250);
  window.addEventListener?.('DOMContentLoaded', fire, { once: true });
  window.addEventListener?.('load', fire, { once: true });
})();
