(() => {
  'use strict';

  const PLUGIN_ID = 'stage-theater';
  const ROOT_ID = 'stg-root';
  const FAB_ID = 'stage-theater-fab';
  const STORAGE_KEY = 'stage-theater-settings-v1';
  const MESSAGE_KEY = PLUGIN_ID;
  const INSTANCE_KEY = '__stageTheaterInstance';
  const STYLE_LINK_ID = 'stage-theater-style-link';
  const hostWindow = window.parent ?? window;
  const hostDocument = hostWindow.document;
  const scriptUrl = document.currentScript?.src || '';
  const SVG = {
    theater: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4z"/><path d="m8 9 2.5 3L8 15m5-6h3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19 13.5 1.4 1.1-1.8 3.1-1.7-.7a7.7 7.7 0 0 1-1.8 1l-.2 1.8h-3.6l-.2-1.8a7.7 7.7 0 0 1-1.8-1l-1.7.7-1.8-3.1L7.2 13.5a7.5 7.5 0 0 1 0-2.1L5.8 10.3l1.8-3.1 1.7.7a7.7 7.7 0 0 1 1.8-1l.2-1.8h3.6l.2 1.8a7.7 7.7 0 0 1 1.8 1l1.7-.7 1.8 3.1-1.4 1.1a7.5 7.5 0 0 1 0 2.1Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9"/><path d="M4 4v5h5M4 13a8 8 0 0 0 14.7 4L20 15"/><path d="M20 20v-5h-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16-.8 4 4-.8L19 8.4a2.3 2.3 0 0 0-3.2-3.2L5 16Z"/><path d="m14.5 6.5 3 3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6m4-6v6M8 7l.7-2h6.6l.7 2m-10 0 .8 13h11.8l.8-13"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 4Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1"/><path d="M16 8V5H5v12h3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 20h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>'
  };

  const DEFAULT_SETTINGS = {
    autoEnabled: false,
    activeProfileId: 'default',
    contextDepth: 10,
    sendWorldbook: false,
    sendPreviousUser: true,
    promptMode: 'merged',
    profiles: [{
      id: 'default',
      name: '默认 API',
      baseUrl: '',
      apiKey: '',
      model: '',
      temperature: 0.9,
      maxTokens: 1200,
      stream: false
    }],
    prompts: [{
      id: 'theater-default',
      name: '小剧场默认提示词',
      content: '请根据提供的角色卡设定、聊天上下文和最新 AI 回复，生成一段独立的小剧场。保留角色性格和世界观，不替用户做决定。输出适合直接作为 HTML 内容显示的小剧场正文，可使用基础 HTML 标签、内联样式和必要的基础 JavaScript；不要输出 Markdown 代码围栏。若存在多个小剧场要求，请清晰分区并分别美化。',
      enabled: true,
      selected: true,
      category: '默认',
      order: 0,
      note: ''
    }]
  };

  let settings = loadSettings();
  let root = null;
  let panel = null;
  let statusTimer = null;
  let requestSerial = 0;
  const pending = new Map();
  let eventsSubscribed = false;
  let observer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeSettings(raw) {
    const next = clone(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return next;
    Object.assign(next, raw);
    next.profiles = Array.isArray(raw.profiles) && raw.profiles.length ? raw.profiles : next.profiles;
    next.prompts = Array.isArray(raw.prompts) && raw.prompts.length ? raw.prompts : next.prompts;
    next.profiles = next.profiles.map((p, index) => ({
      ...DEFAULT_SETTINGS.profiles[0],
      ...p,
      id: p.id || `profile-${Date.now()}-${index}`,
      name: p.name || `API ${index + 1}`
    }));
    next.prompts = next.prompts.map((p, index) => ({
      ...DEFAULT_SETTINGS.prompts[0],
      ...p,
      id: p.id || `prompt-${Date.now()}-${index}`,
      name: p.name || `提示词 ${index + 1}`,
      order: Number.isFinite(Number(p.order)) ? Number(p.order) : index
    }));
    return next;
  }

  function loadSettings() {
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const ctx = getContext();
      const tavern = ctx?.extensionSettings?.[PLUGIN_ID] || window.extension_settings?.[PLUGIN_ID];
      return mergeSettings(local || tavern);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] settings load failed`, error);
      return clone(DEFAULT_SETTINGS);
    }
  }

  async function saveSettings() {
    const snapshot = clone(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] local settings save failed`, error);
    }
    try {
      const ctx = getContext();
      const bag = ctx?.extensionSettings || window.extension_settings;
      if (bag) bag[PLUGIN_ID] = snapshot;
      const save = ctx?.saveSettingsDebounced || window.saveSettingsDebounced;
      if (typeof save === 'function') await save();
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] tavern settings save failed`, error);
    }
  }

  function getContext() {
    try {
      return typeof window.SillyTavern?.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] context unavailable`, error);
      return null;
    }
  }

  function getEventSource(ctx = getContext()) {
    return ctx?.eventSource || window.eventSource;
  }

  function getEventTypes(ctx = getContext()) {
    return ctx?.event_types || ctx?.eventTypes || window.event_types || window.tavern_events;
  }

  function helper(name) {
    const ctx = getContext();
    const candidates = [window.TavernHelper?.[name], window[name], ctx?.[name]];
    return candidates.find((value) => typeof value === 'function') || null;
  }

  function chatMessages(ctx = getContext()) {
    return Array.isArray(ctx?.chat) ? ctx.chat : (Array.isArray(window.SillyTavern?.chat) ? window.SillyTavern.chat : []);
  }

  function getMessage(messageId) {
    const list = chatMessages();
    const numeric = Number(messageId);
    if (Number.isInteger(numeric) && list[numeric]) return list[numeric];
    return list.find((message) => Number(message?.message_id ?? message?.id) === numeric) || null;
  }

  function messageText(message) {
    return String(message?.mes ?? message?.content ?? message?.message ?? '');
  }

  function isAssistantMessage(message) {
    return Boolean(message && !message.is_user && !message.is_system && message.role !== 'system' && message.role !== 'user');
  }

  function findLastAssistant() {
    const list = chatMessages();
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (isAssistantMessage(list[index]) && messageText(list[index]).trim()) return { message: list[index], id: index };
    }
    return null;
  }

  function getChatState() {
    const ctx = getContext();
    try {
      const metadata = ctx?.chatMetadata || window.SillyTavern?.chatMetadata;
      if (!metadata) return {};
      metadata.extensions ||= {};
      metadata.extensions[PLUGIN_ID] ||= {};
      return metadata.extensions[PLUGIN_ID];
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] chat state unavailable`, error);
      return {};
    }
  }

  async function saveChat() {
    const ctx = getContext();
    try {
      const save = ctx?.saveChat || window.saveChatConditional || window.saveChat || ctx?.saveMetadata || window.saveMetadataDebounced;
      if (typeof save === 'function') await save.call(ctx);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] chat save failed`, error);
    }
  }

  function getMessageRecord(message) {
    const extra = message?.extra || {};
    if (extra[MESSAGE_KEY] && typeof extra[MESSAGE_KEY] === 'object') return extra[MESSAGE_KEY];
    const id = chatMessages().indexOf(message);
    const records = getChatState().records;
    return records?.[id] && typeof records[id] === 'object' ? records[id] : null;
  }

  async function saveMessageRecord(message, record) {
    if (!message) return;
    const id = chatMessages().indexOf(message);
    const state = getChatState();
    state.records ||= {};
    message.extra ||= {};
    if (record) {
      message.extra[MESSAGE_KEY] = record;
      state.records[id] = record;
    } else {
      delete message.extra[MESSAGE_KEY];
      delete state.records[id];
    }
    await saveChat();
  }

  function getChatAutoEnabled() {
    const state = getChatState();
    return typeof state.autoEnabled === 'boolean' ? state.autoEnabled : settings.autoEnabled;
  }

  function selectedPrompts() {
    return settings.prompts
      .filter((prompt) => prompt.enabled && prompt.selected && String(prompt.content || '').trim())
      .sort((a, b) => Number(a.order) - Number(b.order));
  }

  async function resolveMacros(text) {
    const value = String(text ?? '');
    const ctx = getContext();
    const extended = ctx?.substituteParamsExtended || window.SillyTavern?.substituteParamsExtended;
    const basic = ctx?.substituteParams || window.SillyTavern?.substituteParams;
    const macro = window.TavernHelper?.substitudeMacros;
    for (const fn of [extended, basic, macro]) {
      if (typeof fn !== 'function') continue;
      try {
        const result = await fn.call(ctx, value);
        if (typeof result === 'string') return result;
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] macro substitution failed`, error);
      }
    }
    return value;
  }

  async function getCharacterContext() {
    try {
      const getCharacter = helper('getCharacter');
      if (getCharacter) {
        const character = await getCharacter('current');
        return JSON.stringify(character, null, 2);
      }
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] character read failed`, error);
    }
    const ctx = getContext();
    const current = ctx?.characters?.[ctx?.characterId] || ctx?.character;
    return current ? JSON.stringify(current, null, 2) : '';
  }

  async function getEnabledWorldbookContext() {
    if (!settings.sendWorldbook) return '';
    const getNames = helper('getGlobalWorldbookNames');
    const getCharNames = helper('getCharWorldbookNames');
    const getChatName = helper('getChatWorldbookName');
    const getBook = helper('getWorldbook');
    if (!getBook) return '';
    const names = new Set();
    try {
      for (const name of (getNames ? getNames() || [] : [])) names.add(name);
      if (getCharNames) {
        const bound = getCharNames('current') || {};
        if (bound.primary) names.add(bound.primary);
        for (const name of bound.additional || []) names.add(name);
      }
      if (getChatName) {
        const chatName = getChatName('current');
        if (chatName) names.add(chatName);
      }
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] worldbook names failed`, error);
    }
    const chunks = [];
    for (const name of names) {
      try {
        const entries = await getBook(name);
        const enabled = (entries || []).filter((entry) => entry && entry.enabled);
        if (!enabled.length) continue;
        chunks.push(`世界书：${name}\n${enabled.map((entry) => `[${entry.name || entry.comment || '条目'}]\n${entry.content || ''}`).join('\n\n')}`);
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] worldbook read failed`, name, error);
      }
    }
    return chunks.join('\n\n');
  }

  function contextMessages(messageId) {
    const list = chatMessages();
    const end = Math.min(Number(messageId), list.length - 1);
    const depth = Math.max(0, Number(settings.contextDepth) || 0);
    const start = Math.max(0, end - depth + 1);
    return list.slice(start, end + 1).map((message) => {
      const role = message?.is_user ? 'user' : (message?.role === 'system' || message?.is_system ? 'system' : 'assistant');
      return { role, content: messageText(message) };
    }).filter((item) => item.content.trim());
  }

  function previousUserMessage(messageId) {
    const list = chatMessages();
    for (let index = Math.min(Number(messageId) - 1, list.length - 1); index >= 0; index -= 1) {
      if (list[index]?.is_user && messageText(list[index]).trim()) return messageText(list[index]);
    }
    return '';
  }

  async function buildRequest(message, messageId, promptOverride = null) {
    const prompts = promptOverride ? [promptOverride] : selectedPrompts();
    const theaterPrompt = prompts.length
      ? (promptOverride
        ? `【当前小剧场提示词：${promptOverride.name}】\n${promptOverride.content}`
        : `请生成 ${prompts.length} 个小剧场，并使用清晰的 HTML 分区分别呈现：\n${prompts.map((prompt, index) => `【小剧场 ${index + 1}：${prompt.name}】\n${prompt.content}`).join('\n\n')}`)
      : '';
    const resolvedPrompt = await resolveMacros(theaterPrompt);
    const character = await getCharacterContext();
    const worldbook = await getEnabledWorldbookContext();
    const context = contextMessages(messageId);
    const userMessage = settings.sendPreviousUser ? previousUserMessage(messageId) : '';
    const payload = [
      '你正在为聊天消息生成独立的小剧场展示内容。',
      character ? `【角色卡设定】\n${character}` : '',
      worldbook ? `【已启用世界书条目】\n${worldbook}` : '',
      settings.contextDepth > 0 ? `【聊天上下文，按正常顺序】\n${context.map((item) => `${item.role}: ${item.content}`).join('\n\n')}` : '',
      userMessage ? `【用户上一条消息】\n${userMessage}` : '',
      `【本次 AI 回复】\n${messageText(message)}`,
      `【小剧场提示词】\n${resolvedPrompt}`,
      '请直接返回最终展示内容，不要解释你的工作过程，不要输出 Markdown 代码围栏。可以使用基础 HTML、内联 CSS 和必要的基础 JavaScript。'
    ].filter(Boolean).join('\n\n');
    return {
      system: '你是一个专门生成聊天附属小剧场的编剧和前端排版助手。严格依据给定设定，不改写原聊天，不替用户行动。输出可直接放进安全沙盒 iframe 展示的 HTML 内容。',
      user: payload,
      prompts
    };
  }

  function activeProfile() {
    return settings.profiles.find((profile) => profile.id === settings.activeProfileId) || settings.profiles[0];
  }

  function endpointCandidates(baseUrl, suffix) {
    const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!raw) return [];
    const direct = raw.endsWith(suffix) ? raw : `${raw}${suffix}`;
    const versioned = raw.endsWith('/v1') ? `${raw}${suffix}` : `${raw}/v1${suffix}`;
    return [...new Set([direct, versioned])];
  }

  function authHeaders(profile) {
    return {
      'Content-Type': 'application/json',
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {})
    };
  }

  async function fetchWithTimeout(url, options, timeout = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function readCompletionResponse(response, onText, streamRequested) {
    const contentType = response.headers?.get?.('content-type') || '';
    if (!streamRequested || contentType.includes('application/json') || !response.body?.getReader) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
      onText?.(content);
      return content;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';
          if (delta) {
            full += delta;
            onText?.(full);
          }
        } catch {
          // Ignore incomplete SSE fragments.
        }
      }
    }
    return full;
  }

  async function askProfile(profile, request, onText) {
    if (!profile?.baseUrl || !profile?.model) throw new Error('请先填写 API 地址和模型名称。');
    const body = {
      model: profile.model,
      temperature: Math.max(0, Number(profile.temperature) || 0),
      max_tokens: Math.max(1, Number(profile.maxTokens) || 1200),
      stream: Boolean(profile.stream),
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user }
      ]
    };
    let lastError = null;
    for (const url of endpointCandidates(profile.baseUrl, '/chat/completions')) {
      try {
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: authHeaders(profile),
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        return await readCompletionResponse(response, onText, Boolean(profile.stream));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('API 请求失败。');
  }

  async function fetchModels(profile) {
    let lastError = null;
    for (const url of endpointCandidates(profile?.baseUrl, '/models')) {
      try {
        const response = await fetchWithTimeout(url, { headers: authHeaders(profile) }, 30000);
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const data = await response.json();
        return (data?.data || data?.models || []).map((item) => typeof item === 'string' ? item : item.id).filter(Boolean);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('模型列表请求失败。');
  }

  function newItem(content, promptNames) {
    return { id: `theater-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, content, promptNames, createdAt: new Date().toISOString(), favorite: false, edited: false };
  }

  async function generateForMessage(messageId, options = {}) {
    const message = getMessage(messageId);
    if (!isAssistantMessage(message)) return false;
    if (!selectedPrompts().length) return setStatus('请先在提示词库中选择至少一条启用提示词。', true);
    const profile = activeProfile();
    if (!profile?.baseUrl || !profile?.apiKey || !profile?.model) return setStatus('请先在 API 设置中填写地址、Key 和模型。', true);
    const serial = ++requestSerial;
    pending.set(Number(messageId), serial);
    setStatus(options.manual ? '正在手动生成小剧场…' : '正在生成小剧场…');
    try {
      const request = await buildRequest(message, messageId);
      const contents = [];
      if (settings.promptMode === 'separate' && request.prompts.length > 1) {
        for (const prompt of request.prompts) {
          const singleRequest = await buildRequest(message, messageId, prompt);
          contents.push(await askProfile(profile, singleRequest, (partial) => setStatus(`正在生成小剧场… ${partial.length} 字`)));
        }
      } else {
        contents.push(await askProfile(profile, request, (partial) => setStatus(`正在生成小剧场… ${partial.length} 字`)));
      }
      if (pending.get(Number(messageId)) !== serial) return false;
      const old = getMessageRecord(message) || {};
      const favorites = [
        ...(Array.isArray(old.favorites) ? old.favorites : []),
        ...(Array.isArray(old.items) ? old.items.filter((item) => item.favorite) : [])
      ].filter((item, index, list) => item?.id && list.findIndex((candidate) => candidate.id === item.id) === index);
      const record = {
        version: 1,
        current: newItem(contents.join('\n\n'), request.prompts.map((prompt) => prompt.name)),
        items: contents.map((content) => newItem(content, request.prompts.map((prompt) => prompt.name))),
        favorites,
        active: 'current',
        updatedAt: new Date().toISOString()
      };
      record.items[0] = record.current;
      await saveMessageRecord(message, record);
      renderMessageTheater(Number(messageId));
      setStatus('小剧场已更新。');
      return true;
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] generation failed`, error);
      setStatus(`生成失败：${error.message || error}`, true);
      return false;
    } finally {
      pending.delete(Number(messageId));
    }
  }

  function messageSelectors(messageId) {
    const id = String(messageId);
    return [
      `[mesid="${CSS.escape(id)}"]`,
      `[data-mesid="${CSS.escape(id)}"]`,
      `[data-message-id="${CSS.escape(id)}"]`,
      `#message_id_${CSS.escape(id)}`,
      `.mes[mesid="${CSS.escape(id)}"]`
    ];
  }

  function findMessageElement(messageId) {
    for (const selector of messageSelectors(messageId)) {
      try {
        const element = hostDocument.querySelector(selector);
        if (element) return element;
      } catch {
        // Try the next known host selector.
      }
    }
    return null;
  }

  function safeHtml(text) {
    const source = String(text || '');
    if (/<[a-z][\s\S]*>/i.test(source)) return source;
    return source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\n/g, '<br>');
  }

  function frameFor(text) {
    const iframe = hostDocument.createElement('iframe');
    iframe.className = 'stg-theater-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups');
    iframe.setAttribute('title', '小剧场内容');
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;color:#eef2f5;font:15px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}body{padding:16px}a{color:#8fc9ff}img{max-width:100%;height:auto}pre{white-space:pre-wrap;background:#111923;padding:10px;border-radius:6px}blockquote{margin:0;padding:8px 12px;border-left:3px solid #8fc9ff;background:#ffffff0d}</style></head><body>${safeHtml(text)}</body></html>`;
    return iframe;
  }

  function button(action, label, icon, extra = '') {
    return `<button type="button" class="stg-icon-button ${extra}" data-stg-action="${action}" title="${label}" aria-label="${label}">${icon}</button>`;
  }

  function activeRecordItem(record) {
    if (!record) return null;
    if (record.active && record.active !== 'current') return (record.favorites || []).find((item) => item.id === record.active) || record.current;
    return record.current || record.items?.[0] || null;
  }

  function renderMessageTheater(messageId) {
    const message = getMessage(messageId);
    const record = getMessageRecord(message);
    const host = findMessageElement(messageId);
    if (!host) return;
    const old = host.querySelector(`.stg-message-theater[data-stg-message-id="${messageId}"]`);
    if (!record?.current && !(record?.favorites || []).length) {
      old?.remove();
      return;
    }
    const box = old || hostDocument.createElement('section');
    box.className = 'stg-message-theater';
    box.dataset.stgMessageId = String(messageId);
    const item = activeRecordItem(record);
    const isFavorite = item && item.id !== record.current?.id;
    const choices = [
      ...(record.current ? [{ id: 'current', label: '当前小剧场' }] : []),
      ...(record.favorites || []).map((favorite, index) => ({ id: favorite.id, label: `收藏 ${index + 1}` }))
    ];
    box.innerHTML = `
      <header class="stg-theater-header">
        <span class="stg-theater-title">${SVG.theater}<span>小剧场</span></span>
        <div class="stg-theater-tools">
          ${choices.length > 1 ? `<select class="stg-theater-select" data-stg-field="active-item" aria-label="选择小剧场">${choices.map((choice) => `<option value="${choice.id}" ${record.active === choice.id ? 'selected' : ''}>${choice.label}</option>`).join('')}</select>` : ''}
          ${button('favorite', isFavorite || item?.favorite ? '取消收藏' : '收藏', SVG.star, item?.favorite || isFavorite ? 'is-active' : '')}
          ${button('edit', '编辑', SVG.edit)}
          ${button('regenerate', '重新生成', SVG.refresh)}
          ${button('delete', '删除此条', SVG.trash)}
          ${button('fold', '折叠', SVG.chevron)}
        </div>
      </header>
      <div class="stg-theater-body">
        <div class="stg-theater-content"></div>
        <div class="stg-edit-area" hidden>
          <textarea data-stg-field="edit-content"></textarea>
          <div class="stg-edit-actions">${button('save-edit', '保存编辑', SVG.copy)}${button('cancel-edit', '取消编辑', SVG.close)}</div>
        </div>
      </div>`;
    const content = box.querySelector('.stg-theater-content');
    if (item) content.appendChild(frameFor(item.content));
    const editor = box.querySelector('[data-stg-field="edit-content"]');
    if (editor) editor.value = item?.content || '';
    if (!old) {
      host.appendChild(box);
    }
    box.querySelector('[data-stg-action="fold"]')?.classList.toggle('is-active', box.classList.contains('is-folded'));
    if (box.classList.contains('is-folded')) box.querySelector('.stg-theater-body').hidden = true;
  }

  async function updateRecord(messageId, updater) {
    const message = getMessage(messageId);
    const record = getMessageRecord(message);
    if (!record) return;
    const next = updater(record);
    await saveMessageRecord(message, next);
    renderMessageTheater(messageId);
  }

  function mountUI() {
    if (!hostDocument.body) return false;
    if (hostDocument.getElementById(ROOT_ID)) {
      root = hostDocument.getElementById(ROOT_ID);
      panel = root.querySelector('.stg-panel');
      ensureFab();
      return true;
    }
    root = hostDocument.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <aside class="stg-panel" hidden>
        <header class="stg-panel-header"><strong>小剧场</strong><button type="button" class="stg-panel-close" data-stg-action="close-panel" title="关闭">${SVG.close}</button></header>
        <div class="stg-panel-status" data-stg-status></div>
        <nav class="stg-tabs">
          <button type="button" class="is-active" data-stg-tab="general">总览</button>
          <button type="button" data-stg-tab="api">API</button>
          <button type="button" data-stg-tab="prompts">提示词</button>
          <button type="button" data-stg-tab="context">上下文</button>
          <button type="button" data-stg-tab="history">记录</button>
        </nav>
        <div class="stg-panel-body" data-stg-panel-body></div>
      </aside>
      <input type="file" accept="application/json" data-stg-import hidden>`;
    hostDocument.body.appendChild(root);
    panel = root.querySelector('.stg-panel');
    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
    root.addEventListener('input', handleInput);
    renderTab('general');
    ensureFab();
    return true;
  }

  function renderTab(tab) {
    const body = root?.querySelector('[data-stg-panel-body]');
    if (!body) return;
    root.querySelectorAll('[data-stg-tab]').forEach((buttonEl) => buttonEl.classList.toggle('is-active', buttonEl.dataset.stgTab === tab));
    if (tab === 'general') body.innerHTML = generalTab();
    if (tab === 'api') body.innerHTML = apiTab();
    if (tab === 'prompts') body.innerHTML = promptsTab();
    if (tab === 'context') body.innerHTML = contextTab();
    if (tab === 'history') body.innerHTML = historyTab();
  }

  function generalTab() {
    const state = getChatState();
    const override = typeof state.autoEnabled === 'boolean' ? String(state.autoEnabled) : 'inherit';
    return `<div class="stg-section">
      <label class="stg-switch-row"><span>自动生成</span><input type="checkbox" data-stg-setting="autoEnabled" ${settings.autoEnabled ? 'checked' : ''}><i></i></label>
      <label class="stg-field"><span>当前聊天</span><select data-stg-chat-toggle><option value="inherit" ${override === 'inherit' ? 'selected' : ''}>跟随全局</option><option value="true" ${override === 'true' ? 'selected' : ''}>启用</option><option value="false" ${override === 'false' ? 'selected' : ''}>关闭</option></select></label>
      <button type="button" class="stg-command-button" data-stg-action="generate-current">${SVG.play}<span>手动生成当前 AI 回复</span></button>
      <p class="stg-muted">自动结果会显示在对应 AI 消息下方，悬浮球仅打开设置。</p>
    </div>`;
  }

  function apiTab() {
    const profile = activeProfile();
    return `<div class="stg-section">
      <label class="stg-field"><span>API 档案</span><select data-stg-profile>${settings.profiles.map((item) => `<option value="${item.id}" ${item.id === profile.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label>
      <div class="stg-inline-actions">${button('new-profile', '新建档案', SVG.plus, 'stg-small-action')}${button('delete-profile', '删除档案', SVG.trash, 'stg-small-action')}</div>
      <label class="stg-field"><span>API 地址</span><input data-stg-profile-field="baseUrl" value="${escapeAttr(profile.baseUrl)}" placeholder="https://example.com/v1"></label>
      <label class="stg-field"><span>API Key</span><input type="password" data-stg-profile-field="apiKey" value="${escapeAttr(profile.apiKey)}"></label>
      <label class="stg-field"><span>模型名称</span><div class="stg-input-action"><input data-stg-profile-field="model" value="${escapeAttr(profile.model)}"><button type="button" data-stg-action="fetch-models" title="获取模型列表">${SVG.refresh}</button></div></label>
      <div class="stg-grid-two"><label class="stg-field"><span>温度</span><input type="number" min="0" max="2" step="0.1" data-stg-profile-field="temperature" value="${profile.temperature}"></label><label class="stg-field"><span>最大输出</span><input type="number" min="1" step="1" data-stg-profile-field="maxTokens" value="${profile.maxTokens}"></label></div>
      <label class="stg-switch-row"><span>流式输出</span><input type="checkbox" data-stg-profile-field="stream" ${profile.stream ? 'checked' : ''}><i></i></label>
      <label class="stg-field"><span>档案名称</span><input data-stg-profile-field="name" value="${escapeAttr(profile.name)}"></label>
    </div>`;
  }

  function promptsTab() {
    const rows = settings.prompts.slice().sort((a, b) => Number(a.order) - Number(b.order)).map((prompt) => `<div class="stg-prompt-row" data-stg-prompt-id="${prompt.id}">
      <div class="stg-prompt-top"><label class="stg-check"><input type="checkbox" data-stg-prompt-field="selected" ${prompt.selected ? 'checked' : ''}><span></span></label><input data-stg-prompt-field="name" value="${escapeAttr(prompt.name)}"><button type="button" data-stg-action="duplicate-prompt" title="复制">${SVG.copy}</button><button type="button" data-stg-action="delete-prompt" title="删除">${SVG.trash}</button></div>
      <div class="stg-prompt-meta"><label>启用 <input type="checkbox" data-stg-prompt-field="enabled" ${prompt.enabled ? 'checked' : ''}></label><input data-stg-prompt-field="category" value="${escapeAttr(prompt.category)}" placeholder="分类"><input type="number" data-stg-prompt-field="order" value="${prompt.order}" title="排序"></div>
      <textarea data-stg-prompt-field="content" placeholder="提示词正文">${escapeHtml(prompt.content)}</textarea>
      <input data-stg-prompt-field="note" value="${escapeAttr(prompt.note)}" placeholder="备注">
    </div>`).join('');
    return `<div class="stg-section"><div class="stg-inline-actions">${button('new-prompt', '新增提示词', SVG.plus, 'stg-small-action')}${button('export-prompts', '导出', SVG.download, 'stg-small-action')}${button('import-prompts', '导入', SVG.upload, 'stg-small-action')}</div><div class="stg-prompt-list">${rows || '<p class="stg-muted">暂无提示词。</p>'}</div></div>`;
  }

  function contextTab() {
    return `<div class="stg-section">
      <label class="stg-field"><span>上下文深度</span><input type="number" min="0" step="1" data-stg-setting="contextDepth" value="${Number(settings.contextDepth) || 0}"></label>
      <label class="stg-field"><span>多提示词模式</span><select data-stg-setting="promptMode"><option value="merged" ${settings.promptMode === 'merged' ? 'selected' : ''}>合并请求</option><option value="separate" ${settings.promptMode === 'separate' ? 'selected' : ''}>分别请求</option></select></label>
      <label class="stg-switch-row"><span>发送已启用世界书条目</span><input type="checkbox" data-stg-setting="sendWorldbook" ${settings.sendWorldbook ? 'checked' : ''}><i></i></label>
      <label class="stg-switch-row"><span>发送用户上一条消息</span><input type="checkbox" data-stg-setting="sendPreviousUser" ${settings.sendPreviousUser ? 'checked' : ''}><i></i></label>
      <p class="stg-muted">角色卡设定始终发送。深度为 0 时不发送聊天上下文，但仍发送当前 AI 回复。</p>
    </div>`;
  }

  function historyTab() {
    const list = chatMessages().map((message, id) => ({ message, id })).filter(({ message }) => getMessageRecord(message)).slice(-20).reverse();
    const rows = list.map(({ message, id }) => {
      const record = getMessageRecord(message);
      return `<button type="button" class="stg-history-row" data-stg-message-id="${id}" data-stg-action="jump-history"><span>#${id}</span><strong>${escapeHtml(messageText(message).slice(0, 48))}</strong><small>${record?.updatedAt ? new Date(record.updatedAt).toLocaleString() : ''}</small></button>`;
    }).join('');
    return `<div class="stg-section"><div class="stg-history-list">${rows || '<p class="stg-muted">暂无生成记录。</p>'}</div></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function setStatus(text, error = false) {
    const target = root?.querySelector('[data-stg-status]');
    if (target) {
      target.textContent = text;
      target.classList.toggle('is-error', error);
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      if (target && !target.classList.contains('is-error')) target.textContent = '';
    }, 5000);
  }

  function positionFab() {
    const fab = hostDocument.getElementById(FAB_ID);
    if (!fab) return;
    const saved = localStorage.getItem(`${STORAGE_KEY}-fab`);
    if (saved) {
      try {
        const point = JSON.parse(saved);
        fab.style.right = `${Math.max(8, Math.min(hostWindow.innerWidth - 56, point.right))}px`;
        fab.style.bottom = `${Math.max(8, Math.min(hostWindow.innerHeight - 56, point.bottom))}px`;
      } catch {}
    }
  }

  function ensureFab() {
    if (!hostDocument.body) return null;
    let fab = hostDocument.getElementById(FAB_ID);
    if (!fab) {
      fab = hostDocument.createElement('button');
      fab.id = FAB_ID;
      fab.type = 'button';
      fab.className = 'stg-fab';
      fab.title = '小剧场设置';
      fab.setAttribute('aria-label', '小剧场设置');
      fab.innerHTML = SVG.theater;
      hostDocument.body.appendChild(fab);
    }

    fab.style.position = 'fixed';
    fab.style.right = '22px';
    fab.style.bottom = '22px';
    fab.style.zIndex = '2147483647';
    fab.style.display = 'grid';
    fab.style.visibility = 'visible';
    fab.style.opacity = '1';
    fab.style.pointerEvents = 'auto';

    if (!fab.dataset.stageTheaterBound) {
      fab.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePanel(true);
      });
      fab.dataset.stageTheaterBound = 'true';
    }
    positionFab();
    return fab;
  }

  function ensureHostStyles() {
    if (hostDocument === document || hostDocument.getElementById(STYLE_LINK_ID)) return;
    const href = new URL('style.css', scriptUrl || document.baseURI).href;
    const link = hostDocument.createElement('link');
    link.id = STYLE_LINK_ID;
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.stageTheater = 'true';
    hostDocument.head?.appendChild(link);
  }

  function togglePanel(show) {
    if (!panel) return;
    panel.hidden = typeof show === 'boolean' ? !show : !panel.hidden;
  }

  async function handleClick(event) {
    const actionElement = event.target.closest('[data-stg-action]');
    const tab = event.target.closest('[data-stg-tab]');
    if (tab) {
      event.preventDefault();
      renderTab(tab.dataset.stgTab);
      return;
    }
    if (!actionElement) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionElement.dataset.stgAction;
    if (action === 'toggle-panel') return togglePanel();
    if (action === 'close-panel') return togglePanel(false);
    if (action === 'generate-current') {
      const last = findLastAssistant();
      if (last) await generateForMessage(last.id, { manual: true });
      else setStatus('当前没有可生成的小剧场的 AI 回复。', true);
      return;
    }
    if (action === 'new-profile') {
      const profile = { ...DEFAULT_SETTINGS.profiles[0], id: `profile-${Date.now()}`, name: `API ${settings.profiles.length + 1}` };
      settings.profiles.push(profile);
      settings.activeProfileId = profile.id;
      await saveSettings();
      renderTab('api');
      return;
    }
    if (action === 'delete-profile') {
      if (settings.profiles.length <= 1) return setStatus('至少保留一个 API 档案。', true);
      settings.profiles = settings.profiles.filter((profile) => profile.id !== settings.activeProfileId);
      settings.activeProfileId = settings.profiles[0].id;
      await saveSettings();
      renderTab('api');
      return;
    }
    if (action === 'fetch-models') {
      try {
        const models = await fetchModels(activeProfile());
        if (!models.length) return setStatus('接口没有返回可用模型。', true);
        const model = hostWindow.prompt(`可用模型：\n${models.join('\n')}\n\n请输入要使用的模型名称`, activeProfile().model || models[0]);
        if (model) {
          activeProfile().model = model.trim();
          await saveSettings();
          renderTab('api');
        }
      } catch (error) {
        setStatus(`获取模型失败：${error.message || error}`, true);
      }
      return;
    }
    if (action === 'new-prompt') {
      settings.prompts.push({ ...clone(DEFAULT_SETTINGS.prompts[0]), id: `prompt-${Date.now()}`, name: `提示词 ${settings.prompts.length + 1}`, content: '', order: settings.prompts.length });
      await saveSettings();
      renderTab('prompts');
      return;
    }
    if (action === 'delete-prompt') {
      const row = actionElement.closest('[data-stg-prompt-id]');
      settings.prompts = settings.prompts.filter((prompt) => prompt.id !== row?.dataset.stgPromptId);
      await saveSettings();
      renderTab('prompts');
      return;
    }
    if (action === 'duplicate-prompt') {
      const row = actionElement.closest('[data-stg-prompt-id]');
      const source = settings.prompts.find((prompt) => prompt.id === row?.dataset.stgPromptId);
      if (source) settings.prompts.push({ ...clone(source), id: `prompt-${Date.now()}`, name: `${source.name} 副本`, order: settings.prompts.length });
      await saveSettings();
      renderTab('prompts');
      return;
    }
    if (action === 'export-prompts') {
      const blob = new Blob([JSON.stringify(settings.prompts, null, 2)], { type: 'application/json' });
      const link = hostDocument.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'stage-theater-prompts.json';
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    if (action === 'import-prompts') {
      root.querySelector('[data-stg-import]').click();
      return;
    }
    if (action === 'jump-history') {
      const id = Number(actionElement.dataset.stgMessageId);
      findMessageElement(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      togglePanel(false);
      return;
    }
    const theater = actionElement.closest('.stg-message-theater');
    if (!theater) return;
    const messageId = Number(theater.dataset.stgMessageId);
    const message = getMessage(messageId);
    const record = getMessageRecord(message);
    if (!record) return;
    if (action === 'regenerate') return generateForMessage(messageId, { manual: true });
    if (action === 'fold') {
      theater.classList.toggle('is-folded');
      theater.querySelector('.stg-theater-body').hidden = theater.classList.contains('is-folded');
      actionElement.classList.toggle('is-active', theater.classList.contains('is-folded'));
      return;
    }
    if (action === 'edit') {
      theater.querySelector('.stg-theater-content').hidden = true;
      theater.querySelector('.stg-edit-area').hidden = false;
      return;
    }
    if (action === 'cancel-edit') {
      renderMessageTheater(messageId);
      return;
    }
    if (action === 'save-edit') {
      const text = theater.querySelector('[data-stg-field="edit-content"]').value;
      await updateRecord(messageId, (next) => {
        const item = activeRecordItem(next);
        if (!item) return next;
        item.content = text;
        item.edited = true;
        if (item.id === next.current?.id) next.current = item;
        return next;
      });
      return;
    }
    if (action === 'favorite') {
      await updateRecord(messageId, (next) => {
        const item = activeRecordItem(next);
        if (!item) return next;
        const isCurrent = item.id === next.current?.id;
        if (isCurrent) {
          item.favorite = !item.favorite;
          if (item.favorite) next.favorites = [...(next.favorites || []).filter((favorite) => favorite.id !== item.id), item];
          else next.favorites = (next.favorites || []).filter((favorite) => favorite.id !== item.id);
        } else {
          next.favorites = (next.favorites || []).filter((favorite) => favorite.id !== item.id);
          item.favorite = false;
        }
        return next;
      });
      return;
    }
    if (action === 'delete') {
      await updateRecord(messageId, (next) => {
        const item = activeRecordItem(next);
        if (item && item.id !== next.current?.id) {
          next.favorites = (next.favorites || []).filter((favorite) => favorite.id !== item.id);
          next.active = 'current';
        } else {
          next.current = null;
          next.items = [];
          next.active = 'current';
        }
        return next;
      });
    }
  }

  async function handleChange(event) {
    const target = event.target;
    if (target.matches('[data-stg-import]') && target.files?.[0]) {
      try {
        const data = JSON.parse(await target.files[0].text());
        if (!Array.isArray(data)) throw new Error('文件格式不是提示词数组。');
        settings.prompts = data.map((prompt, index) => ({ ...clone(DEFAULT_SETTINGS.prompts[0]), ...prompt, id: prompt.id || `prompt-${Date.now()}-${index}`, order: Number(prompt.order) || index }));
        await saveSettings();
        renderTab('prompts');
      } catch (error) {
        setStatus(`导入失败：${error.message || error}`, true);
      } finally {
        target.value = '';
      }
      return;
    }
    if (target.matches('[data-stg-setting="autoEnabled"]')) {
      settings.autoEnabled = target.checked;
      await saveSettings();
      return;
    }
    if (target.matches('[data-stg-chat-toggle]')) {
      const state = getChatState();
      if (target.value === 'inherit') delete state.autoEnabled;
      else state.autoEnabled = target.value === 'true';
      await saveChat();
      return;
    }
    if (target.matches('[data-stg-profile]')) {
      settings.activeProfileId = target.value;
      await saveSettings();
      renderTab('api');
      return;
    }
    if (target.matches('[data-stg-setting]')) {
      const key = target.dataset.stgSetting;
      settings[key] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      await saveSettings();
      return;
    }
    if (target.matches('[data-stg-profile-field]')) {
      const profile = activeProfile();
      const key = target.dataset.stgProfileField;
      profile[key] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      await saveSettings();
      return;
    }
    if (target.matches('[data-stg-prompt-field]')) {
      const row = target.closest('[data-stg-prompt-id]');
      const prompt = settings.prompts.find((item) => item.id === row?.dataset.stgPromptId);
      if (!prompt) return;
      const key = target.dataset.stgPromptField;
      prompt[key] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      await saveSettings();
      return;
    }
    const select = target.closest('[data-stg-field="active-item"]');
    if (select) {
      const theater = target.closest('.stg-message-theater');
      const message = getMessage(Number(theater.dataset.stgMessageId));
      const record = getMessageRecord(message);
      record.active = target.value;
      await saveMessageRecord(message, record);
      renderMessageTheater(Number(theater.dataset.stgMessageId));
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.matches('[data-stg-prompt-field]')) {
      const row = target.closest('[data-stg-prompt-id]');
      const prompt = settings.prompts.find((item) => item.id === row?.dataset.stgPromptId);
      if (!prompt) return;
      const key = target.dataset.stgPromptField;
      prompt[key] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      saveSettings();
    }
  }

  function renderAllStoredTheaters() {
    chatMessages().forEach((message, id) => {
      if (getMessageRecord(message)) renderMessageTheater(id);
    });
  }

  function subscribeEvents() {
    if (eventsSubscribed) return true;
    const ctx = getContext();
    const events = getEventSource(ctx);
    const types = getEventTypes(ctx);
    if (!events?.on || !types) return false;
    const on = (name, handler) => {
      if (name) {
        try { events.on(name, handler); } catch (error) { console.warn(`[${PLUGIN_ID}] event subscribe failed`, name, error); }
      }
    };
    on(types.APP_READY, () => fire());
    on(types.MESSAGE_RECEIVED, async (messageId, type) => {
      const allowed = ['normal', 'regenerate', 'swipe', 'first_message'];
      if (!allowed.includes(type) || !getChatAutoEnabled()) return;
      await generateForMessage(Number(messageId));
    });
    on(types.CHARACTER_MESSAGE_RENDERED, (messageId) => renderMessageTheater(Number(messageId)));
    on(types.MESSAGE_UPDATED, (messageId) => renderMessageTheater(Number(messageId)));
    on(types.CHAT_CHANGED, () => setTimeout(() => {
      renderAllStoredTheaters();
      renderTab('general');
    }, 200));
    eventsSubscribed = true;
    return true;
  }

  function init() {
    if (!hostDocument.body) return false;
    try {
      ensureHostStyles();
      if (!mountUI()) return false;
      subscribeEvents();
      renderAllStoredTheaters();
      setTimeout(renderAllStoredTheaters, 700);
      if (!observer && typeof hostWindow.MutationObserver === 'function') {
        observer = new hostWindow.MutationObserver(() => {
          if (hostDocument.querySelector('.mes, [mesid], [data-mesid]')) renderAllStoredTheaters();
        });
        observer.observe(hostDocument.body, { childList: true, subtree: true });
      }
      return true;
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] init failed`, error);
      return false;
    }
  }

  let initialized = false;
  const fire = () => {
    if (initialized) {
      ensureFab();
      subscribeEvents();
      return;
    }
    try {
      initialized = init();
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] init failed`, error);
      initialized = false;
    }
  };
  const initialContext = getContext();
  const initialEvents = getEventSource(initialContext);
  const initialTypes = getEventTypes(initialContext);
  if (initialEvents?.on && initialTypes?.APP_READY) initialEvents.on(initialTypes.APP_READY, fire);
  if (hostDocument.readyState === 'loading') hostDocument.addEventListener('DOMContentLoaded', fire, { once: true });
  const started = Date.now();
  const interval = setInterval(() => {
    if (hostDocument.body) fire();
    if (initialized && eventsSubscribed && hostDocument.getElementById(FAB_ID)) {
      clearInterval(interval);
    } else if (Date.now() - started > 10000) {
      clearInterval(interval);
    }
  }, 250);

  const previousInstance = hostWindow[INSTANCE_KEY];
  if (previousInstance?.destroy) {
    try {
      previousInstance.destroy();
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] previous instance cleanup failed`, error);
    }
  }

  const instance = {
    destroy: () => {
      observer?.disconnect?.();
      observer = null;
      hostDocument.getElementById(ROOT_ID)?.remove();
      hostDocument.getElementById(FAB_ID)?.remove();
      hostDocument.getElementById(STYLE_LINK_ID)?.remove();
      if (hostWindow[INSTANCE_KEY] === instance) delete hostWindow[INSTANCE_KEY];
    }
  };
  hostWindow[INSTANCE_KEY] = instance;
  hostWindow.addEventListener('pagehide', () => {
    if (hostWindow[INSTANCE_KEY] === instance) instance.destroy();
  }, { once: true });
})();
