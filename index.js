(() => {
  'use strict';

  const PLUGIN_ID = 'stage-theater';
  const ROOT_ID = 'stg-root';
  const FAB_ID = 'stage-theater-fab';
  const STORAGE_KEY = 'stage-theater-settings-v1';
  const LOG_STORAGE_KEY = 'stage-theater-logs-v1';
  const MAX_LOGS = 100;
  const MAX_LOG_STORAGE_CHARS = 1500000;
  const IMAGE_PROMPT_PATTERN = /image###([\s\S]{1,4000}?)###/gi;
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
    fabSize: 48,
    fabImage: null,
    fabShape: 'circle',
    selectedCategories: [],
    selectedWorldbooks: [],
    systemPrompt: '你是一个专门生成聊天附属小剧场的编剧和前端排版助手。严格依据给定设定，不改写原聊天，不替用户行动。输出可直接放进安全沙盒 iframe 展示的 HTML 内容。',
    randomMode: {
      enabled: false,
      groups: [],
      count: 1
    },
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
  let hostEventsBound = false;
  let fabResizeBound = false;
  let fabResizeHandler = null;
  let fabResizeWindow = null;
  let fabSizeSaveTimer = null;
  let logRenderTimer = null;
  const logs = loadLogs();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadLogs() {
    try {
      const stored = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((entry) => entry && entry.message).slice(-MAX_LOGS) : [];
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] logs load failed`, error);
      return [];
    }
  }

  function persistLogs() {
    try {
      let serialized = JSON.stringify(logs);
      while (serialized.length > MAX_LOG_STORAGE_CHARS && logs.length > 1) {
        logs.shift();
        serialized = JSON.stringify(logs);
      }
      localStorage.setItem(LOG_STORAGE_KEY, serialized);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] logs save failed`, error);
    }
  }

  function addLog(message, level = 'info', details = '', detailsLabel = '查看详情') {
    const normalizedDetails = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: String(message || ''),
      details: normalizedDetails,
      detailsLabel
    };
    logs.push(logEntry);
    if (logs.length > MAX_LOGS) logs.shift();
    persistLogs();
    if (root?.querySelector('[data-stg-tab="logs"].is-active') && panel && !panel.hidden) {
      clearTimeout(logRenderTimer);
      logRenderTimer = setTimeout(() => renderTab('logs'), 80);
    }
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

    next.fabSize = Math.max(32, Math.min(120, Number(next.fabSize) || DEFAULT_SETTINGS.fabSize));

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
    if (settings.randomMode?.enabled) {
      const groups = settings.randomMode.groups || [];
      const count = Math.max(1, Number(settings.randomMode.count) || 1);
      let pool = settings.prompts.filter((prompt) => prompt.enabled && String(prompt.content || '').trim());
      if (groups.length > 0) {
        pool = pool.filter(p => groups.includes(p.category || '默认'));
      }
      if (!pool.length) return [];
      const selected = [];
      const copy = [...pool];
      for (let i = 0; i < count && copy.length; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        selected.push(copy[idx]);
        copy.splice(idx, 1);
      }
      return selected.sort((a, b) => Number(a.order) - Number(b.order));
    }
    return settings.prompts
      .filter((prompt) => prompt.enabled && String(prompt.content || '').trim())
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
    const selectedNames = settings.selectedWorldbooks && settings.selectedWorldbooks.length > 0
      ? new Set(settings.selectedWorldbooks)
      : names;
    const chunks = [];
    for (const name of selectedNames) {
      if (!names.has(name)) continue;
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
      '请按以下格式严格返回结果：\n【标题】≤10字的简洁标题\n【内容】\n[小剧场HTML内容]\n\n如生成多个小剧场，用 ===== 分隔：\n【标题】标题1\n【内容】\n内容1\n=====\n【标题】标题2\n【内容】\n内容2'
    ].filter(Boolean).join('\n\n');
    return {
      system: settings.systemPrompt || '你是一个专门生成聊天附属小剧场的编剧和前端排版助手。严格依据给定设定，不改写原聊天，不替用户行动。输出可直接放进安全沙盒 iframe 展示的 HTML 内容。',
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

  function redactUrl(value) {
    try {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) {
        if (/key|token|secret|auth/i.test(key)) url.searchParams.set(key, '***');
      }
      return url.toString();
    } catch {
      return String(value || '').replace(/([?&](?:key|token|secret|auth)[^=]*=)[^&]*/gi, '$1***');
    }
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
    console.log(`[${PLUGIN_ID}] [诊断] askProfile 入口`);
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
    console.log(`[${PLUGIN_ID}] [诊断] askProfile 参数：model=${profile.model}，stream=${profile.stream}，userContent长度=${request.user.length}`);
    let lastError = null;
    const candidates = endpointCandidates(profile.baseUrl, '/chat/completions');
    console.log(`[${PLUGIN_ID}] [诊断] askProfile 候选URL数=${candidates.length}`);
    for (const url of candidates) {
      try {
        console.log(`[${PLUGIN_ID}] [诊断] askProfile 尝试URL: ${url}`);
        addLog(`发送 API 请求 · ${profile.model}`, 'info', {
          url: redactUrl(url),
          method: 'POST',
          body
        }, '查看实际发送内容');
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: authHeaders(profile),
          body: JSON.stringify(body)
        });
        console.log(`[${PLUGIN_ID}] [诊断] askProfile 收到响应，status=${response.status}`);
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          const errorBody = await response.text().catch(() => '');
          addLog(`API 请求失败 · HTTP ${response.status}`, 'error', errorBody, '查看返回内容');
          continue;
        }
        console.log(`[${PLUGIN_ID}] [诊断] askProfile 即将读取响应`);
        const result = await readCompletionResponse(response, onText, Boolean(profile.stream));
        console.log(`[${PLUGIN_ID}] [诊断] askProfile 响应读取完成，长度=${result.length}`);
        addLog(`API 返回成功 · ${result.length} 字`, 'success', result, '查看完整返回内容');
        return result;
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] [诊断] askProfile 请求异常: ${error.message}`);
        addLog(`API 请求异常 · ${error.message || error}`, 'error', `请求地址：${redactUrl(url)}\n\n${error.stack || error}`, '查看错误详情');
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

  function newItem(content, promptNames, title = '') {
    return { id: `theater-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, content, promptNames, title, createdAt: new Date().toISOString(), favorite: false, edited: false };
  }

  async function generateForMessage(messageId, options = {}) {
    console.log(`[${PLUGIN_ID}] [诊断] generateForMessage 入口，messageId=${messageId}，当前pending数=${pending.size}`);
    const message = getMessage(messageId);
    if (!isAssistantMessage(message)) {
      console.log(`[${PLUGIN_ID}] [诊断] 消息不是AI消息，跳过`);
      return false;
    }
    if (!selectedPrompts().length) return setStatus('请先在提示词库中选择至少一条启用提示词。', true);
    const profile = activeProfile();
    if (!profile?.baseUrl || !profile?.apiKey || !profile?.model) return setStatus('请先在 API 设置中填写地址、Key 和模型。', true);
    const serial = ++requestSerial;
    pending.set(Number(messageId), serial);
    console.log(`[${PLUGIN_ID}] [诊断] 新建请求 serial=${serial}，messageId=${messageId}，pending数=${pending.size}`);

    const startText = options.manual ? '正在重新生成小剧场…' : '正在生成小剧场…';
    setStatus(startText);
    setGenerationProgress(messageId, startText, 'loading');
    addLog(`${options.manual ? '手动' : '自动'}生成开始 · 消息 #${messageId}`, 'info');

    try {
      console.log(`[${PLUGIN_ID}] [诊断] 开始 buildRequest`);
      const request = await buildRequest(message, messageId);
      console.log(`[${PLUGIN_ID}] [诊断] buildRequest 完成，prompts=${request.prompts.length}个`);
      const contents = [];
      if (settings.promptMode === 'separate' && request.prompts.length > 1) {
        console.log(`[${PLUGIN_ID}] [诊断] 分别请求模式`);
        for (const prompt of request.prompts) {
          const singleRequest = await buildRequest(message, messageId, prompt);
          console.log(`[${PLUGIN_ID}] [诊断] 单个 prompt="${prompt.name}" 请求前，即将调用 askProfile`);
          contents.push(await askProfile(profile, singleRequest, (partial) => {
            const text = `正在生成小剧场… ${partial.length} 字`;
            setStatus(text);
            setGenerationProgress(messageId, text, 'loading');
          }));
          console.log(`[${PLUGIN_ID}] [诊断] 单个 prompt="${prompt.name}" 请求完成`);
        }
      } else {
        console.log(`[${PLUGIN_ID}] [诊断] 合并请求模式`);
        contents.push(await askProfile(profile, request, (partial) => {
          const text = `正在生成小剧场… ${partial.length} 字`;
          setStatus(text);
          setGenerationProgress(messageId, text, 'loading');
        }));
        console.log(`[${PLUGIN_ID}] [诊断] askProfile 完成`);
      }
      if (pending.get(Number(messageId)) !== serial) {
        console.log(`[${PLUGIN_ID}] [诊断] 请求被替换，当前serial=${pending.get(Number(messageId))}，预期=${serial}，跳过保存`);
        return false;
      }

      // 从返回内容中提取单个小剧场（用===== 分隔）
      const extractTheaters = (fullResponse) => {
        console.log(`[${PLUGIN_ID}] [日志] AI返回内容长度=${fullResponse.length}，前200字:\n${fullResponse.slice(0, 200)}`);
        const parts = fullResponse.split(/\s*=====\s*/);
        console.log(`[${PLUGIN_ID}] [日志] 按=====分隔后得到${parts.length}个部分`);
        return parts.map((part, idx) => {
          const titleMatch = part.match(/【标题】\s*(.+?)(?=【内容】|$)/s);
          const contentMatch = part.match(/【内容】\s*([\s\S]*)/);
          const title = titleMatch ? titleMatch[1].trim().slice(0, 20) : '小剧场';
          const content = contentMatch ? contentMatch[1].trim() : part;
          console.log(`[${PLUGIN_ID}] [日志] 部分${idx}: 标题="${title}", 内容长度=${content.length}`);
          return { title, content };
        }).filter((item) => item.content.trim().length > 0);
      };

      const itemsData = contents.map((response) => extractTheaters(response)).flat();
      console.log(`[${PLUGIN_ID}] [日志] 最终提取到${itemsData.length}个小剧场`);

      const old = getMessageRecord(message) || {};
      // 关键：保留旧的favorites，重新生成时不覆盖已收藏的小剧场
      const favorites = old.favorites && Array.isArray(old.favorites) ? old.favorites : [];

      console.log(`[${PLUGIN_ID}] [日志] 准备创建record: itemsData.length=${itemsData.length}, favorites.length=${favorites.length}`);

      const record = {
        version: 1,
        current: itemsData[0] ? newItem(itemsData[0].content, request.prompts.map((prompt) => prompt.name), itemsData[0].title) : null,
        items: itemsData.map((data) => newItem(data.content, request.prompts.map((prompt) => prompt.name), data.title)),
        favorites: favorites,
        active: 'current',
        updatedAt: new Date().toISOString()
      };
      if (record.current) record.items[0] = record.current;
      console.log(`[${PLUGIN_ID}] [日志] record创建完成: items=${record.items.length}, current=${record.current?.title || 'null'}`);
      console.log(`[${PLUGIN_ID}] [诊断] 即将 saveMessageRecord`);
      await saveMessageRecord(message, record);
      console.log(`[${PLUGIN_ID}] [诊断] saveMessageRecord 完成，即将 renderMessageTheater`);
      renderMessageTheater(Number(messageId));
      setStatus('小剧场已更新。');
      setGenerationProgress(messageId, '生成完成', 'success');
      addLog(`生成完成 · 消息 #${messageId} · ${itemsData.length} 个小剧场`, 'success');
      return true;
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] generation failed`, error);
      if (pending.get(Number(messageId)) === serial) {
        setStatus(`生成失败：${error.message || error}`, true);
        setGenerationProgress(messageId, `生成失败：${error.message || error}`, 'error');
      }
      addLog(`生成失败 · 消息 #${messageId}`, 'error', error.stack || String(error), '查看错误详情');
      return false;
    } finally {
      console.log(`[${PLUGIN_ID}] [诊断] generateForMessage 出口，messageId=${messageId}，即将删除pending`);
      if (pending.get(Number(messageId)) === serial) pending.delete(Number(messageId));
      console.log(`[${PLUGIN_ID}] [诊断] pending 已删除，当前pending数=${pending.size}`);
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

  function extractImagePrompts(text) {
    const prompts = [];
    const source = String(text || '');
    for (const match of source.matchAll(new RegExp(IMAGE_PROMPT_PATTERN.source, IMAGE_PROMPT_PATTERN.flags))) {
      const prompt = String(match[1] || '').trim();
      if (!prompt) continue;
      prompts.push({
        raw: match[0],
        prompt,
        occurrence: prompts.length,
        sourceIndex: match.index
      });
    }
    return prompts;
  }

  function imageOutputHtml(output) {
    if (Array.isArray(output)) return output.map(imageOutputHtml).filter(Boolean).join('');
    if (typeof output === 'string') {
      const value = output.trim();
      if (/^(?:https?:|data:image\/|blob:)/i.test(value)) return `<img src="${escapeAttr(value)}" alt="小剧场插图">`;
      return value;
    }
    if (!output || typeof output !== 'object') return '';
    if (typeof output.outerHTML === 'string') return output.outerHTML;
    if (typeof output.imageHtml === 'string') return imageOutputHtml(output.imageHtml);
    if (typeof output.html === 'string') return imageOutputHtml(output.html);
    const source = output.url || output.src || output.imageUrl || output.dataUrl;
    return typeof source === 'string' ? imageOutputHtml(source) : '';
  }

  function frameFor(text, options = {}) {
    const frameId = `stg-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const iframe = hostDocument.createElement('iframe');
    iframe.className = 'stg-theater-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups');
    iframe.setAttribute('title', '小剧场内容');
    iframe.setAttribute('data-stg-frame-id', frameId);

    const prompts = extractImagePrompts(text).map((entry, index) => ({
      ...entry,
      slotId: `${frameId}-image-${index}`,
      storageKey: `${entry.raw}::${entry.occurrence}`,
      frameId,
      messageId: Number.isFinite(Number(options.messageId)) ? Number(options.messageId) : null,
      itemId: options.itemId || ''
    }));
    const generatedImages = options.generatedImages && typeof options.generatedImages === 'object' ? options.generatedImages : {};
    let promptIndex = 0;
    const renderedContent = safeHtml(text).replace(new RegExp(IMAGE_PROMPT_PATTERN.source, IMAGE_PROMPT_PATTERN.flags), () => {
      const entry = prompts[promptIndex];
      promptIndex += 1;
      if (!entry) return '';
      const savedImage = imageOutputHtml(generatedImages[entry.storageKey] || generatedImages[entry.raw] || generatedImages[entry.prompt]);
      return `<span id="${entry.slotId}" class="stg-image-slot${savedImage ? ' has-image' : ''}" data-stg-image-slot="${entry.slotId}">${savedImage || `<span class="stg-image-placeholder">等待生图 · ${escapeHtml(entry.prompt)}</span>`}</span>`;
    });

    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;color:#eef2f5;font:15px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}body{padding:16px}a{color:#8fc9ff}img{max-width:100%;height:auto}pre{white-space:pre-wrap;background:#111923;padding:10px;border-radius:6px}blockquote{margin:0;padding:8px 12px;border-left:3px solid #8fc9ff;background:#ffffff0d}.stg-image-slot{display:block;margin:12px 0;max-width:100%}.stg-image-slot.has-image{padding:0;background:transparent}.stg-image-slot img{display:block;max-width:100%;height:auto;margin:auto;border-radius:8px}.stg-image-placeholder{display:block;padding:14px;border:1px dashed #4f6f69;border-radius:8px;color:#9fc9bd;background:#10201d;text-align:center;font-size:12px}</style></head><body>${renderedContent}<script>
var frameId='${frameId}';
function reportHeight(){
  var h=document.body.scrollHeight;
  window.parent.postMessage({type:'stg-frame-height',frameId:frameId,height:h},'*');
}
setTimeout(reportHeight,100);
window.addEventListener('message', function(e){
  if(e.data && e.data.type==='stg-insert-image' && e.data.frameId===frameId && e.data.imageHtml){
    var selected=e.data.slotId ? document.getElementById(e.data.slotId) : null;
    var slots=selected ? [selected] : document.querySelectorAll('.stg-image-slot');
    slots.forEach(function(slot){
      slot.innerHTML=e.data.imageHtml;
      slot.classList.add('has-image');
      slot.querySelectorAll('img').forEach(function(img){img.addEventListener('load',reportHeight,{once:true});});
    });
    setTimeout(reportHeight,200);
  }
});
</script></body></html>`;

    let heightSet = false;
    const handleMessage = (e) => {
      if (!heightSet && e.data?.type === 'stg-frame-height' && e.data?.frameId === frameId && typeof e.data.height === 'number') {
        heightSet = true;
        iframe.style.minHeight = Math.max(180, e.data.height + 32) + 'px';
      }
      if (e.data?.type === 'stg-frame-height' && e.data?.frameId === frameId) {
        iframe.style.minHeight = Math.max(180, e.data.height + 32) + 'px';
      }
    };

    hostWindow.addEventListener('message', handleMessage);
    iframe.dataset.stgFrameId = frameId;
    iframe.stgImagePrompts = prompts;
    return iframe;
  }

  function publishImagePrompts(container, iframe) {
    const prompts = iframe?.stgImagePrompts || [];
    container.querySelector('.stg-image-bridge')?.remove();
    if (!prompts.length) {
      delete container.dataset.stgImageTokens;
      delete container.dataset.stgImagePrompts;
      return;
    }

    container.dataset.stgImageTokens = prompts.map((entry) => entry.raw).join('\n');
    container.dataset.stgImagePrompts = JSON.stringify(prompts.map(({ raw, prompt, occurrence, slotId, storageKey, frameId, messageId, itemId }) => ({ raw, prompt, occurrence, slotId, storageKey, frameId, messageId, itemId })));
    const bridge = hostDocument.createElement('div');
    bridge.className = 'stg-image-bridge';
    bridge.setAttribute('aria-hidden', 'true');
    prompts.forEach((entry) => {
      const token = hostDocument.createElement('span');
      token.className = 'stg-image-prompt-token';
      token.dataset.stgImageToken = entry.raw;
      token.dataset.stgImagePrompt = entry.prompt;
      token.dataset.stgImageSlot = entry.slotId;
      token.textContent = entry.raw;
      bridge.appendChild(token);
    });
    container.appendChild(bridge);

    const detail = { source: PLUGIN_ID, container, iframe, prompts: prompts.map((entry) => ({ ...entry })) };
    setTimeout(() => {
      hostDocument.dispatchEvent(new hostWindow.CustomEvent('stage-theater:image-prompts', { detail }));
      hostWindow.dispatchEvent(new hostWindow.CustomEvent('stage-theater:image-prompts', { detail }));
    }, 0);
  }

  function button(action, label, icon, extra = '', style = '') {
    return `<button type="button" class="stg-text-button ${extra}" data-stg-action="${action}" title="${label}" aria-label="${label}" ${style}>${label}</button>`;
  }

  function activeRecordItem(record) {
    if (!record) return null;
    // 如果active指定了某个item的id，从items或favorites中查找
    if (record.active && record.active !== 'current') {
      const found = (record.items || []).find((item) => item.id === record.active) ||
                    (record.favorites || []).find((item) => item.id === record.active);
      if (found) return found;
    }
    // 否则返回current或items[0]
    return record.current || record.items?.[0] || null;
  }

  function theaterMountPoint(messageElement) {
    return messageElement.querySelector('.mes_block, .mes_text') || messageElement;
  }

  function renderMessageTheater(messageId) {
    const message = getMessage(messageId);
    const record = getMessageRecord(message);
    const host = findMessageElement(messageId);
    if (!host) return;
    console.log(`[${PLUGIN_ID}] [日志] renderMessageTheater: messageId=${messageId}, record.items=${record?.items?.length || 0}, record.favorites=${record?.favorites?.length || 0}`);
    const old = [...host.querySelectorAll('.stg-message-theater')]
      .find((element) => element.dataset.stgMessageId === String(messageId));
    if (!record?.current && !(record?.favorites || []).length) {
      old?.remove();
      return;
    }

    const box = old || hostDocument.createElement('section');
    box.className = 'stg-message-theater stg-theater-window';
    box.dataset.stgRole = 'message-theater';
    box.dataset.stgMessageId = String(messageId);
    const item = activeRecordItem(record);
    box.dataset.stgLastItemId = item?.id || '';

    const isFavorite = item && item.id !== record.current?.id;

    // 构建下拉菜单：显示所有小剧场版本
    const choices = [];

    // 添加所有items（包括current）
    if (record.items && record.items.length > 0) {
      record.items.forEach((itm, idx) => {
        const isCurrent = itm.id === record.current?.id;
        const label = isCurrent ? `当前: ${itm.title || '小剧场'}` : `${itm.title || '小剧场'} (v${idx + 1})`;
        choices.push({ id: itm.id, label });
      });
    }

    // 添加收藏
    if (record.favorites && record.favorites.length > 0) {
      record.favorites.forEach((fav, idx) => {
        choices.push({ id: fav.id, label: `💾 ${fav.title || '收藏'} ${idx + 1}` });
      });
    }

    console.log(`[${PLUGIN_ID}] [日志] choices.length=${choices.length}`);


    box.innerHTML = `
      <header class="stg-theater-header">
        <span class="stg-theater-title">${SVG.theater}<span>小剧场</span></span>
        <div class="stg-theater-tools">
          ${choices.length > 0 ? `<select class="stg-theater-select" data-stg-field="active-item" aria-label="选择小剧场">${choices.map((choice) => `<option value="${choice.id}" ${record.active === choice.id ? 'selected' : ''}>${choice.label}</option>`).join('')}</select>` : ''}
          ${button('favorite', isFavorite || item?.favorite ? '取消收藏' : '收藏', SVG.star, item?.favorite || isFavorite ? 'is-active' : '')}
          ${button('edit', '编辑', SVG.edit)}
          ${button('regenerate', '重新生成', SVG.refresh)}
          ${button('delete', '删除此条', SVG.trash)}
          ${button('fold', '折叠', SVG.chevron)}
        </div>
      </header>
      <div class="stg-theater-body">
        <div class="stg-theater-progress" data-stg-generation-status hidden></div>
        <div class="stg-theater-content"></div>
        <div class="stg-edit-area" hidden>
          <textarea data-stg-field="edit-content"></textarea>
          <div class="stg-edit-actions">${button('save-edit', '保存编辑', SVG.copy)}${button('cancel-edit', '取消编辑', SVG.close)}</div>
        </div>
      </div>`;
    const content = box.querySelector('.stg-theater-content');
    content.innerHTML = '';  // 清空旧内容
    if (item) {
      const iframe = frameFor(item.content, {
        messageId,
        itemId: item.id,
        generatedImages: item.generatedImages
      });
      content.appendChild(iframe);
      publishImagePrompts(box, iframe);
    }
    const editor = box.querySelector('[data-stg-field="edit-content"]');
    if (editor) editor.value = item?.content || '';
    if (!old) theaterMountPoint(host).appendChild(box);
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
    if (!hostDocument.body) {
      return false;
    }
    if (hostDocument.getElementById(ROOT_ID)) {
      root = hostDocument.getElementById(ROOT_ID);
      panel = root.querySelector('.stg-panel');
      ensureFab();
      return true;
    }
    root = hostDocument.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <button type="button" class="stg-fab" id="${FAB_ID}" title="小剧场设置" aria-label="小剧场设置">${SVG.theater}</button>
      <aside class="stg-panel" hidden>
        <header class="stg-panel-header"><strong>小剧场</strong><button type="button" class="stg-panel-close" data-stg-action="close-panel" title="关闭">${SVG.close}</button></header>
        <div class="stg-panel-status" data-stg-status></div>
        <nav class="stg-tabs">
          <button type="button" class="is-active" data-stg-tab="general">总览</button>
          <button type="button" data-stg-tab="api">API</button>
          <button type="button" data-stg-tab="prompts">提示词</button>
          <button type="button" data-stg-tab="context">上下文</button>
          <button type="button" data-stg-tab="system">系统</button>
          <button type="button" data-stg-tab="logs">日志</button>
          <button type="button" data-stg-tab="history">记录</button>
          <button type="button" data-stg-tab="favorites">收藏库</button>
        </nav>
        <div class="stg-panel-body" data-stg-panel-body></div>
      </aside>
      <input type="file" accept="application/json" data-stg-import hidden>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-stg-fab-image-upload hidden>`;
    hostDocument.body.appendChild(root);
    panel = root.querySelector('.stg-panel');
    bindHostEvents();
    renderTab('general');
    ensureFab();
    return true;
  }

  function bindHostEvents() {
    if (hostEventsBound) return;
    hostDocument.addEventListener('click', handleClick);
    hostDocument.addEventListener('change', handleChange);
    hostDocument.addEventListener('input', handleInput);
    hostEventsBound = true;
  }

  function unbindHostEvents() {
    if (!hostEventsBound) return;
    hostDocument.removeEventListener('click', handleClick);
    hostDocument.removeEventListener('change', handleChange);
    hostDocument.removeEventListener('input', handleInput);
    hostEventsBound = false;
  }

  function renderTab(tab) {
    const body = root?.querySelector('[data-stg-panel-body]');
    if (!body) return;
    root.querySelectorAll('[data-stg-tab]').forEach((buttonEl) => buttonEl.classList.toggle('is-active', buttonEl.dataset.stgTab === tab));
    if (tab === 'general') body.innerHTML = generalTab();
    if (tab === 'api') body.innerHTML = apiTab();
    if (tab === 'prompts') {
      body.innerHTML = promptsTab();
      setTimeout(() => {
        const enabledCheckbox = hostDocument.getElementById('stg-random-enabled');
        if (enabledCheckbox) {
          enabledCheckbox.addEventListener('change', async (e) => {
            if (!e.target.checked) {
              settings.randomMode = { enabled: false, group: '', count: 1 };
            } else {
              settings.randomMode = { enabled: true, group: settings.randomMode?.group || '', count: settings.randomMode?.count || 1 };
            }
            await saveSettings();
            renderTab('prompts');
          });
        }
      }, 0);
    }
    if (tab === 'context') {
      body.innerHTML = contextTab();
      setTimeout(() => updateWorldbookList(), 0);
    }
    if (tab === 'system') body.innerHTML = systemTab();
    if (tab === 'logs') body.innerHTML = logsTab();
    if (tab === 'history') body.innerHTML = historyTab();
    if (tab === 'favorites') body.innerHTML = favoritesTab();
  }

  function generalTab() {
    const state = getChatState();
    const override = typeof state.autoEnabled === 'boolean' ? String(state.autoEnabled) : 'inherit';
    return `<div class="stg-section stg-settings-page">
      <div class="stg-settings-card">
        <div class="stg-settings-card-title">生成设置</div>
        <label class="stg-switch-row"><span>全局自动生成</span><input type="checkbox" data-stg-setting="autoEnabled" ${settings.autoEnabled ? 'checked' : ''}><i></i></label>
        <label class="stg-field"><span>当前聊天</span><select data-stg-chat-toggle><option value="inherit" ${override === 'inherit' ? 'selected' : ''}>跟随全局</option><option value="true" ${override === 'true' ? 'selected' : ''}>单独启用</option><option value="false" ${override === 'false' ? 'selected' : ''}>单独关闭</option></select></label>
        <button type="button" class="stg-command-button" data-stg-action="generate-current">${SVG.play}<span>手动生成当前 AI 回复</span></button>
        <p class="stg-muted">结果显示在对应 AI 消息下方。</p>
      </div>

      <div class="stg-settings-card">
        <div class="stg-settings-card-title">悬浮球外观</div>
        <label class="stg-field"><span>大小 <output data-stg-fab-size-output>${settings.fabSize}px</output></span>
          <div class="stg-size-control"><input type="range" min="32" max="120" step="4" data-stg-setting="fabSize" value="${settings.fabSize}"><input type="number" min="32" max="120" step="4" data-stg-setting="fabSize" value="${settings.fabSize}" aria-label="悬浮球大小"></div>
        </label>
        <label class="stg-field"><span>形状</span><select data-stg-setting="fabShape">
          <option value="circle" ${settings.fabShape === 'circle' ? 'selected' : ''}>圆形</option>
          <option value="square" ${settings.fabShape === 'square' ? 'selected' : ''}>圆角方形</option>
          <option value="none" ${settings.fabShape === 'none' ? 'selected' : ''}>直角方形</option>
        </select></label>
        <div class="stg-field"><span>自定义图片</span>
          <div class="stg-inline-actions">
            ${settings.fabImage ? `<button type="button" class="stg-small-action" data-stg-action="preview-fab-image" title="预览">预览</button>` : ''}
            <button type="button" class="stg-small-action" data-stg-action="upload-fab-image" title="上传图片">选择图片</button>
            ${settings.fabImage ? `<button type="button" class="stg-small-action" data-stg-action="remove-fab-image" title="删除图片">移除图片</button>` : ''}
          </div>
        </div>
        <p class="stg-muted">${settings.fabImage ? '已使用自定义图片' : '支持 PNG、JPG、WebP，建议使用透明背景。'}</p>
      </div>
    </div>`;
  }

  function apiTab() {
    const profile = activeProfile();
    return `<div class="stg-section">
      <label class="stg-field"><span>API 档案</span><select data-stg-profile>${settings.profiles.map((item) => `<option value="${item.id}" ${item.id === profile.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label>
      <div class="stg-inline-actions">${button('new-profile', '新建档案', SVG.plus, 'stg-small-action')}${button('delete-profile', '删除档案', SVG.trash, 'stg-small-action')}</div>
      <label class="stg-field"><span>API 地址</span><input data-stg-profile-field="baseUrl" value="${escapeAttr(profile.baseUrl)}" placeholder="https://example.com/v1"></label>
      <label class="stg-field"><span>API Key</span><input type="password" data-stg-profile-field="apiKey" value="${escapeAttr(profile.apiKey)}"></label>
      <div class="stg-field">
        <span>选择模型</span>
        <div style="display:flex;gap:5px">
          <input data-stg-profile-field="model" value="${escapeAttr(profile.model)}" placeholder="输入模型名或点击刷新获取列表" style="flex:1">
          <button type="button" data-stg-action="fetch-models" title="获取可用模型" style="width:35px;height:35px;padding:6px;border:1px solid var(--stg-line);border-radius:5px;background:var(--stg-panel-2);cursor:pointer;display:grid;place-items:center;color:var(--stg-text)">${SVG.refresh}</button>
        </div>
        <div id="stg-model-list" class="stg-model-list" style="display:none"></div>
      </div>
      <div class="stg-grid-two"><label class="stg-field"><span>温度</span><input type="number" min="0" max="2" step="0.1" data-stg-profile-field="temperature" value="${profile.temperature}"></label><label class="stg-field"><span>最大输出</span><input type="number" min="1" step="1" data-stg-profile-field="maxTokens" value="${profile.maxTokens}"></label></div>
      <label class="stg-switch-row"><span>流式输出</span><input type="checkbox" data-stg-profile-field="stream" ${profile.stream ? 'checked' : ''}><i></i></label>
      <label class="stg-field"><span>档案名称</span><input data-stg-profile-field="name" value="${escapeAttr(profile.name)}"></label>
    </div>`;
  }

  function promptsTab() {
    const grouped = {};
    settings.prompts.forEach(p => {
      const cat = p.category || '默认';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    const categories = Object.keys(grouped).sort();
    const selectedCategories = settings.selectedCategories || [];

    // 顶部分组标签
    const groupTags = categories.map(cat => `
      <button type="button" class="stg-group-chip ${selectedCategories.includes(cat) ? 'active' : ''}"
        data-category="${escapeAttr(cat)}"
        style="padding:6px 12px;border:1px solid var(--stg-line);border-radius:16px;background:${selectedCategories.includes(cat) ? 'var(--stg-accent)' : '#1a2835'};color:${selectedCategories.includes(cat) ? '#0a0f14' : 'var(--stg-text)'};cursor:pointer;transition:all 0.2s ease;font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px"
        title="点击选择分组">
        ${escapeHtml(cat)} <span style="font-size:10px;opacity:0.7">${grouped[cat].length}</span>
      </button>
    `).join('');

    // 显示选中分组中的提示词
    const displayCategories = selectedCategories.length ? selectedCategories : categories;
    let promptsList = '';
    displayCategories.forEach(cat => {
      if (!grouped[cat]) return;
      const prompts = grouped[cat];
      prompts.forEach(p => {
        const contentId = `prompt-content-${p.id}`;
        promptsList += `<div data-stg-prompt-id="${p.id}" style="margin-bottom:8px;padding:10px;background:#0d1620;border:1px solid var(--stg-line);border-radius:4px">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
            <button type="button" onclick="
              const content = document.getElementById('${contentId}');
              const btn = this;
              if (content.style.display === 'none') {
                content.style.display = 'block';
                btn.textContent = '▼';
              } else {
                content.style.display = 'none';
                btn.textContent = '▶';
              }
            " style="width:20px;height:20px;padding:0;background:transparent;border:none;cursor:pointer;color:var(--stg-text);font-weight:bold;font-size:12px;flex-shrink:0;display:grid;place-items:center" title="展开/收起">▶</button>
            <label class="stg-check" style="flex-shrink:0;cursor:pointer" title="勾选启用此提示词"><input type="checkbox" data-stg-prompt-field="enabled" ${p.enabled ? 'checked' : ''}><span></span></label>
            <input data-stg-prompt-field="name" value="${escapeAttr(p.name)}" placeholder="提示词名称" style="flex:1;min-width:0;padding:4px;background:transparent;border:none;color:var(--stg-text);font-size:12px;outline:none">
            <span style="font-size:11px;color:var(--stg-muted);background:#0a0f14;padding:2px 6px;border-radius:3px;flex-shrink:0">${escapeHtml(cat)}</span>
            <button type="button" data-stg-action="duplicate-prompt" title="复制此提示词" style="padding:4px 8px;background:transparent;border:1px solid var(--stg-line);border-radius:3px;cursor:pointer;color:var(--stg-text);flex-shrink:0;font-size:12px">复制</button>
            <button type="button" data-stg-action="delete-prompt" title="删除此提示词" style="padding:4px 8px;background:transparent;border:1px solid var(--stg-line);border-radius:3px;cursor:pointer;color:var(--stg-text);flex-shrink:0;font-size:12px" data-stg-prompt-id="${p.id}">删除</button>
          </div>
          <textarea id="${contentId}" data-stg-prompt-field="content" placeholder="在此输入提示词内容..." style="display:none;width:100%;min-height:100px;resize:vertical;padding:8px;background:#0e151a;border:1px solid var(--stg-line);border-radius:3px;color:var(--stg-text);font-size:12px;margin-bottom:6px">${escapeHtml(p.content)}</textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button type="button" data-stg-action="save-prompt" title="保存名称和内容的修改" style="padding:6px 12px;background:var(--stg-accent);color:#0a0f14;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600">保存编辑</button>
          </div>
        </div>`;
      });
    });

    return `<div class="stg-section">
      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--stg-muted);margin-bottom:8px">分组筛选 (点击选择)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${groupTags}
          <button type="button" class="stg-group-chip" data-category="_all_" style="padding:6px 12px;border:1px solid var(--stg-line);border-radius:16px;background:${selectedCategories.length === 0 ? 'var(--stg-accent)' : '#1a2835'};color:${selectedCategories.length === 0 ? '#0a0f14' : 'var(--stg-text)'};cursor:pointer;transition:all 0.2s ease;font-size:12px;white-space:nowrap">全部</button>
        </div>
      </div>

      <div class="stg-inline-actions">
        ${button('new-prompt', '新提示词', SVG.plus, 'stg-small-action')}
        ${button('new-group', '新分组', SVG.plus, 'stg-small-action')}
        ${button('export-prompts', '导出', SVG.download, 'stg-small-action')}
        ${button('import-prompts', '导入', SVG.upload, 'stg-small-action')}
      </div>

      <div style="margin:12px 0;padding:12px;background:#0d1620;border:1px solid var(--stg-line);border-radius:6px">
        <div style="font-size:11px;color:var(--stg-muted);margin-bottom:8px">🎲 随机抽取设置</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;color:var(--stg-text);font-size:12px;flex-shrink:0">
            <input type="checkbox" id="stg-random-enabled" ${settings.randomMode?.enabled ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
            启用随机
          </label>
          <input type="number" id="stg-random-count" min="1" max="99" value="${settings.randomMode?.count || 1}"
            ${!settings.randomMode?.enabled ? 'disabled' : ''} style="width:50px;padding:4px;background:#0e151a;border:1px solid var(--stg-line);color:var(--stg-text);font-size:11px;border-radius:3px;cursor:${!settings.randomMode?.enabled ? 'not-allowed' : 'text'}" title="每次抽取数量">
          <span style="color:var(--stg-muted);font-size:11px">条 / 从选中分组随机抽</span>
          ${button('apply-random', '保存设置', SVG.play, 'stg-small-action')}
        </div>
      </div>

      <div style="margin-top:12px">${promptsList || '<p class="stg-muted" style="text-align:center;padding:20px">暂无提示词</p>'}</div>
    </div>`;
  }

  function contextTab() {
    return `<div class="stg-section stg-settings-page">
      <div class="stg-settings-card">
        <div class="stg-settings-card-title">聊天上下文</div>
        <label class="stg-field"><span>上下文深度</span><input type="number" min="0" step="1" data-stg-setting="contextDepth" value="${Number(settings.contextDepth) || 0}"></label>
        <label class="stg-field"><span>多提示词模式</span><select data-stg-setting="promptMode"><option value="merged" ${settings.promptMode === 'merged' ? 'selected' : ''}>合并为一次请求</option><option value="separate" ${settings.promptMode === 'separate' ? 'selected' : ''}>分别发送请求</option></select></label>
        <label class="stg-switch-row"><span>发送用户上一条消息</span><input type="checkbox" data-stg-setting="sendPreviousUser" ${settings.sendPreviousUser ? 'checked' : ''}><i></i></label>
        <p class="stg-muted">角色卡设定始终发送；深度为 0 时仅发送当前 AI 回复。</p>
      </div>
      <div class="stg-settings-card">
        <div class="stg-settings-card-title">世界书</div>
        <label class="stg-switch-row"><span>发送已启用的世界书条目</span><input type="checkbox" data-stg-setting="sendWorldbook" ${settings.sendWorldbook ? 'checked' : ''}><i></i></label>
        <div id="stg-worldbooks-section" class="stg-worldbooks-section" ${settings.sendWorldbook ? '' : 'hidden'}>
          <div class="stg-worldbook-toolbar">
            <span data-stg-worldbook-summary>正在读取世界书…</span>
            <button type="button" class="stg-small-action" data-stg-action="all-worldbooks">发送全部</button>
          </div>
          <p class="stg-muted">勾选后只发送选中的世界书；不勾选时发送全部可用世界书。</p>
          <div id="stg-worldbooks-list" class="stg-worldbooks-list"></div>
        </div>
      </div>
    </div>`;
  }

  function systemTab() {
    return `<div class="stg-section">
      <label class="stg-field"><span style="margin-bottom:8px;display:block">系统提示词 (发给AI的系统消息)</span><textarea data-stg-setting="systemPrompt" style="min-height:200px;resize:vertical;padding:8px;background:#0a0f14;border:1px solid var(--stg-line);color:var(--stg-text);font-size:12px;border-radius:4px">${escapeHtml(settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt)}</textarea></label>
      <p class="stg-muted">这是发给AI的系统级提示词，用于规定AI生成小剧场时的基本行为。可添加破限功能干扰以及其他要求。</p>
      <button type="button" class="stg-command-button" data-stg-action="reset-system-prompt" style="margin-top:12px">${SVG.refresh}<span>恢复默认系统提示词</span></button>
    </div>`;
  }

  async function updateWorldbookList() {
    const getNames = helper('getGlobalWorldbookNames');
    const getCharNames = helper('getCharWorldbookNames');
    const getChatName = helper('getChatWorldbookName');
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
    } catch {}
    const list = hostDocument.getElementById('stg-worldbooks-list');
    if (!list) return;
    const selectedNames = settings.selectedWorldbooks || [];
    const summary = hostDocument.querySelector('[data-stg-worldbook-summary]');
    if (names.size === 0) {
      list.innerHTML = '<p class="stg-muted" style="font-size:12px">未检测到世界书</p>';
      if (summary) summary.textContent = '未检测到世界书';
      return;
    }
    if (summary) summary.textContent = selectedNames.length ? `已选 ${selectedNames.length} / ${names.size}` : `发送全部 ${names.size} 本`;
    list.innerHTML = Array.from(names).map(name => `
      <label class="stg-worldbook-option">
        <input type="checkbox" value="${escapeAttr(name)}" data-stg-worldbook-name ${selectedNames.includes(name) ? 'checked' : ''}>
        <span class="stg-worldbook-check" aria-hidden="true"></span>
        <span class="stg-worldbook-name">${escapeHtml(name)}</span>
      </label>
    `).join('');
  }

  function logsTab() {
    const logItems = logs.slice(-50).reverse().map((log) => {
      const date = new Date(log.timestamp);
      const timestamp = Number.isNaN(date.getTime()) ? log.timestamp : date.toLocaleString();
      const levelLabel = log.level === 'error' ? '错误' : log.level === 'warn' ? '警告' : log.level === 'success' ? '成功' : '信息';
      return `<article class="stg-log-item is-${escapeAttr(log.level || 'info')}">
        <div class="stg-log-summary"><time>${escapeHtml(timestamp)}</time><span>${levelLabel}</span><strong>${escapeHtml(log.message)}</strong></div>
        ${log.details ? `<details><summary>${escapeHtml(log.detailsLabel || '查看详情')}</summary><pre>${escapeHtml(log.details)}</pre></details>` : ''}
      </article>`;
    }).join('');
    return `<div class="stg-logs">
      <div class="stg-log-toolbar">
        <span>保留最近 ${MAX_LOGS} 条，刷新页面也不会丢失</span>
        <button type="button" class="stg-small-action" data-stg-action="clear-logs" title="清空日志">清空</button>
        <button type="button" class="stg-small-action" data-stg-action="export-logs" title="导出日志">导出</button>
      </div>
      <div class="stg-log-list">
        ${logItems || '<div class="stg-log-empty">暂无日志。生成一次小剧场后，这里会记录实际发送内容、接口状态和完整返回内容。</div>'}
      </div>
    </div>`;
  }

  function favoritesTab() {
    const allFavorites = [];
    chatMessages().forEach((message, messageId) => {
      const record = getMessageRecord(message);
      if (record?.favorites && Array.isArray(record.favorites)) {
        record.favorites.forEach((favorite) => {
          allFavorites.push({
            messageId,
            favorite,
            createdAt: favorite.createdAt,
            promptNames: favorite.promptNames || [],
            title: favorite.title || '（无标题）'
          });
        });
      }
    });

    if (!allFavorites.length) {
      return `<div class="stg-section"><p class="stg-muted">暂无收藏的小剧场。</p></div>`;
    }

    const rows = allFavorites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item) => {
      return `<div class="stg-favorite-item" data-stg-favorite-id="${item.favorite.id}" data-stg-message-id="${item.messageId}">
        <div class="stg-favorite-header">
          <strong style="flex:1;min-width:0;word-break:break-word">${escapeHtml(item.title)}</strong>
          <button type="button" data-stg-action="view-favorite" title="查看" style="width:28px;height:28px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;display:inline-grid;place-items:center">${SVG.play}</button>
          <button type="button" data-stg-action="remove-favorite" title="删除收藏" style="width:28px;height:28px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;display:inline-grid;place-items:center">${SVG.trash}</button>
        </div>
        <div class="stg-favorite-meta" style="color:var(--stg-muted);font-size:12px;margin-top:4px">
          <span>${item.promptNames.join(', ') || '（无标签）'}</span>
          <span style="margin-left:8px">${new Date(item.createdAt).toLocaleString()}</span>
        </div>
      </div>`;
    }).join('');

    return `<div class="stg-section"><div style="display:grid;gap:10px">${rows}</div></div>`;
  }

  function showFavoriteModal(favoriteId, record, messageId) {
    const favorite = (record.favorites || []).find((fav) => fav.id === favoriteId);
    if (!favorite) return;

    const oldModal = hostDocument.querySelector('.stg-modal');
    if (oldModal) {
      if (oldModal.open && typeof oldModal.close === 'function') oldModal.close();
      oldModal.remove();
    }
    const modal = hostDocument.createElement('dialog');
    modal.id = `stg-modal-${favoriteId}`;
    modal.className = 'stg-modal';
    modal.setAttribute('aria-label', favorite.title || '收藏的小剧场');

    const box = hostDocument.createElement('div');
    box.className = 'stg-modal-dialog';

    box.innerHTML = `
      <header class="stg-modal-header">
        <strong>${escapeHtml(favorite.title || '小剧场')}</strong>
        <button type="button" class="stg-panel-close" data-stg-action="close-modal" title="关闭（Esc）" aria-label="关闭">${SVG.close}</button>
      </header>
      <div class="stg-modal-content"></div>
    `;

    const content = box.querySelector('.stg-modal-content');
    const iframe = frameFor(favorite.content, {
      messageId,
      itemId: favorite.id,
      generatedImages: favorite.generatedImages
    });
    content.appendChild(iframe);
    publishImagePrompts(modal, iframe);

    const closeModal = () => {
      hostDocument.removeEventListener('keydown', escListener);
      if (modal.open) modal.close();
      modal.remove();
    };
    box.querySelector('[data-stg-action="close-modal"]').addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeModal();
    });

    const escListener = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    hostDocument.addEventListener('keydown', escListener);

    modal.appendChild(box);
    hostDocument.body.appendChild(modal);
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
    modal.focus({ preventScroll: true });
  }

  function historyTab() {
    const list = chatMessages().map((message, id) => ({ message, id })).filter(({ message }) => getMessageRecord(message)).slice(-20).reverse();
    const rows = list.map(({ message, id }) => {
      const record = getMessageRecord(message);
      const item = activeRecordItem(record);
      const title = item?.title || '（无标题）';
      return `<button type="button" class="stg-history-row" data-stg-message-id="${id}" data-stg-action="jump-history"><span>#${id}</span><strong>${escapeHtml(title)}</strong><small>${record?.updatedAt ? new Date(record.updatedAt).toLocaleString() : ''}</small></button>`;
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
    const fab = root?.querySelector(`#${FAB_ID}`);
    if (target) {
      target.textContent = text;
      target.classList.toggle('is-error', error);
    }
    if (fab && text) {
      fab.dataset.stgNotice = text;
      fab.classList.toggle('is-notice-error', error);
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      if (target && !target.classList.contains('is-error')) target.textContent = '';
      if (fab && !pending.size && fab.dataset.stgState !== 'error') {
        delete fab.dataset.stgNotice;
        fab.classList.remove('is-notice-error');
      }
    }, 5000);
  }

  function setGenerationProgress(messageId, text, state = 'loading') {
    const fab = root?.querySelector(`#${FAB_ID}`);
    if (fab) {
      fab.dataset.stgNotice = text;
      fab.dataset.stgState = state;
      fab.classList.toggle('is-generating', state === 'loading');
      fab.classList.toggle('is-notice-error', state === 'error');
      fab.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    }

    const theater = findMessageElement(messageId)?.querySelector(`.stg-message-theater[data-stg-message-id="${CSS.escape(String(messageId))}"]`);
    if (theater) {
      let progress = theater.querySelector('[data-stg-generation-status]');
      if (!progress) {
        progress = hostDocument.createElement('div');
        progress.className = 'stg-theater-progress';
        progress.dataset.stgGenerationStatus = '';
        theater.querySelector('.stg-theater-body')?.prepend(progress);
      }
      progress.hidden = false;
      progress.textContent = text;
      progress.dataset.state = state;
      theater.classList.toggle('is-generating', state === 'loading');
      theater.querySelector('[data-stg-action="regenerate"]')?.toggleAttribute('disabled', state === 'loading');
    }

    if (state !== 'loading') {
      const delay = state === 'error' ? 7000 : 3000;
      setTimeout(() => {
        const currentFab = root?.querySelector(`#${FAB_ID}`);
        if (currentFab?.dataset.stgNotice === text && !pending.size) {
          delete currentFab.dataset.stgNotice;
          delete currentFab.dataset.stgState;
          currentFab.classList.remove('is-generating', 'is-notice-error');
        }
        const currentTheater = findMessageElement(messageId)?.querySelector(`.stg-message-theater[data-stg-message-id="${CSS.escape(String(messageId))}"]`);
        const currentProgress = currentTheater?.querySelector('[data-stg-generation-status]');
        if (currentProgress?.textContent === text) {
          currentProgress.hidden = true;
          currentTheater.classList.remove('is-generating');
          currentTheater.querySelector('[data-stg-action="regenerate"]')?.removeAttribute('disabled');
        }
      }, delay);
    }
  }

  function applyFabSize(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    settings.fabSize = Math.max(32, Math.min(120, numeric));
    root?.querySelectorAll('[data-stg-setting="fabSize"]').forEach((input) => {
      if (Number(input.value) !== settings.fabSize) input.value = String(settings.fabSize);
    });
    const output = root?.querySelector('[data-stg-fab-size-output]');
    if (output) output.textContent = `${settings.fabSize}px`;
    ensureFab();
    return true;
  }

  function positionFab() {
    const fab = root?.querySelector(`#${FAB_ID}`);
    if (!fab) return;
    const viewport = fab.ownerDocument?.defaultView || hostWindow;
    const padding = 12;
    const width = fab.offsetWidth || 48;
    const height = fab.offsetHeight || 48;

    // 尝试恢复保存的位置
    const saved = localStorage.getItem(`${STORAGE_KEY}-fab`);
    if (saved) {
      try {
        const point = JSON.parse(saved);
        const left = Number(point?.left);
        const top = Number(point?.top);

        if (Number.isFinite(left) && Number.isFinite(top)) {
          const constrainedLeft = Math.max(padding, Math.min(viewport.innerWidth - width - padding, left));
          const constrainedTop = Math.max(padding, Math.min(viewport.innerHeight - height - padding, top));

          fab.style.left = `${constrainedLeft}px`;
          fab.style.top = `${constrainedTop}px`;
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
          fab.style.transform = 'none';
          positionPanel();
          return;
        }
      } catch {}
    }

    // 首次加载，居中显示
    const centerLeft = (viewport.innerWidth - width) / 2;
    const centerTop = (viewport.innerHeight - height) / 2;
    fab.style.left = `${Math.round(centerLeft)}px`;
    fab.style.top = `${Math.round(centerTop)}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.style.transform = 'none';
    positionPanel();
  }

  function saveFabPosition(fab, left, top) {
    try {
      localStorage.setItem(`${STORAGE_KEY}-fab`, JSON.stringify({ left, top }));
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] FAB position save failed`, error);
    }
  }

  function positionPanel() {
    if (!panel || panel.hidden) return;
    const viewport = panel.ownerDocument?.defaultView || hostWindow;
    const visualViewport = viewport.visualViewport;
    const viewportWidth = visualViewport?.width || viewport.innerWidth;
    const viewportHeight = visualViewport?.height || viewport.innerHeight;
    const offsetLeft = visualViewport?.offsetLeft || 0;
    const offsetTop = visualViewport?.offsetTop || 0;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    if (!panelWidth || !panelHeight) return;
    const margin = 12;
    const left = offsetLeft + Math.max(margin, (viewportWidth - panelWidth) / 2);
    const top = offsetTop + Math.max(margin, (viewportHeight - panelHeight) / 2);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
  }

  function ensureFab() {
    if (!hostDocument.body || !root) {
      console.warn('[FAB] 无法创建：body 或 root 不存在');
      return null;
    }
    let fab = root.querySelector(`#${FAB_ID}`);
    const detachedFab = hostDocument.getElementById(FAB_ID);
    if (!fab && detachedFab) {
      fab = detachedFab;
      root.appendChild(fab);
    }
    if (!fab) {
      fab = hostDocument.createElement('button');
      fab.id = FAB_ID;
      fab.type = 'button';
      fab.className = 'stg-fab';
      fab.title = '小剧场设置';
      fab.setAttribute('aria-label', '小剧场设置');
      fab.innerHTML = SVG.theater;
      root.appendChild(fab);
    }

    // 立刻给 FAB 加 inline style（不管是否新建）
    fab.style.cssText = `
      display: grid;
      place-items: center;
      position: fixed;
      z-index: 2147483647;
      border: none;
      background: linear-gradient(135deg, #1a4d45, #0d2a27);
      color: #c7f3e3;
      cursor: pointer;
      font-size: 20px;
      padding: 0;
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      touch-action: none;
      user-select: none;
      transition: transform 0.25s ease;
      box-shadow: none;
    `;
      console.log('[FAB] 已创建，位置:', {
        bottom: fab.style.bottom,
        right: fab.style.right,
        zIndex: fab.style.zIndex,
        display: window.getComputedStyle(fab).display,
        visibility: window.getComputedStyle(fab).visibility
      });

    fab.style.position = 'fixed';
    fab.style.zIndex = '2147483647';
    fab.style.display = 'grid';
    fab.style.visibility = 'visible';
    fab.style.opacity = '1';
    fab.style.pointerEvents = 'auto';

      // 应用FAB自定义设置
    const fabSize = Math.max(32, Math.min(120, Number(settings.fabSize) || 48));
    fab.style.setProperty('width', `${fabSize}px`, 'important');
    fab.style.setProperty('height', `${fabSize}px`, 'important');
    fab.style.setProperty('min-width', `${fabSize}px`, 'important');
    fab.style.setProperty('min-height', `${fabSize}px`, 'important');
    fab.style.setProperty('font-size', `${Math.round(fabSize * 0.48)}px`, 'important');

    // 应用形状和背景
    fab.innerHTML = '';  // 先清空

    if (settings.fabImage) {
      // 使用图片作为背景
      fab.style.backgroundImage = `url("${settings.fabImage}")`;
      fab.style.backgroundSize = 'cover';
      fab.style.backgroundPosition = 'center';
    } else {
      // 使用默认图标
      fab.style.backgroundImage = 'none';
      fab.innerHTML = SVG.theater;
    }

    if (settings.fabShape === 'circle') {
      fab.style.borderRadius = '50%';
    } else if (settings.fabShape === 'square') {
      fab.style.borderRadius = '8px';
    } else {
      fab.style.borderRadius = '0';
    }

    if (!fab.dataset.stageTheaterBound) {
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let moved = false;
      let suppressClick = false;
      let currentDeltaX = 0;
      let currentDeltaY = 0;

      fab.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const rect = fab.getBoundingClientRect();
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        moved = false;
        suppressClick = false;
        currentDeltaX = 0;
        currentDeltaY = 0;
        fab.style.transition = 'none';
        fab.setPointerCapture?.(event.pointerId);
      });

      fab.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!moved && Math.hypot(deltaX, deltaY) <= 3) return;
        moved = true;
        suppressClick = true;
        event.preventDefault();
        const width = fab.offsetWidth || 48;
        const height = fab.offsetHeight || 48;
        const padding = 12;
        const viewport = fab.ownerDocument?.defaultView || hostWindow;
        const maxLeft = Math.max(padding, viewport.innerWidth - width - padding);
        const maxTop = Math.max(padding, viewport.innerHeight - height - padding);
        const left = Math.max(padding, Math.min(maxLeft, startLeft + deltaX));
        const top = Math.max(padding, Math.min(maxTop, startTop + deltaY));
        currentDeltaX = left - startLeft;
        currentDeltaY = top - startTop;
        fab.style.transform = `translate3d(${currentDeltaX}px, ${currentDeltaY}px, 0)`;
        positionPanel();
      });

      const finishPointer = (event) => {
        if (pointerId !== event.pointerId) return;
        const wasMoved = moved;
        if (moved) {
          const width = fab.offsetWidth || 48;
          const height = fab.offsetHeight || 48;
          const padding = 12;
          const viewport = fab.ownerDocument?.defaultView || hostWindow;
          const rect = fab.getBoundingClientRect();
          const finalLeft = rect.left;
          const finalTop = rect.top;
          const constrainLeft = Math.max(padding, Math.min(viewport.innerWidth - width - padding, finalLeft));
          const constrainTop = Math.max(padding, Math.min(viewport.innerHeight - height - padding, finalTop));
          fab.style.transform = '';
          fab.style.left = `${Math.round(constrainLeft)}px`;
          fab.style.top = `${Math.round(constrainTop)}px`;
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
          saveFabPosition(fab, constrainLeft, constrainTop);
          positionFab();
        } else {
          fab.style.transform = '';
        }
        fab.releasePointerCapture?.(event.pointerId);
        fab.style.transition = 'box-shadow 0.25s ease';
        pointerId = null;
        moved = false;
        suppressClick = event.type === 'pointerup' && wasMoved;
        currentDeltaX = 0;
        currentDeltaY = 0;
      };

      fab.addEventListener('pointerup', finishPointer);
      fab.addEventListener('pointercancel', finishPointer);
      fab.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        togglePanel();  // 点击悬浮球切换打开/关闭
      });
      fab.dataset.stageTheaterBound = 'true';
    }
    if (!fabResizeBound) {
      fabResizeHandler = () => {
        positionFab();
        positionPanel();
      };
      fabResizeWindow = fab.ownerDocument?.defaultView || hostWindow;
      fabResizeWindow.addEventListener('resize', fabResizeHandler);
      fabResizeWindow.visualViewport?.addEventListener('resize', fabResizeHandler);
      fabResizeWindow.visualViewport?.addEventListener('scroll', fabResizeHandler);
      fabResizeBound = true;
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
    if (hostDocument.head) {
      hostDocument.head.appendChild(link);
    } else {
    }
  }

  function togglePanel(show) {
    if (!panel) return;
    panel.hidden = typeof show === 'boolean' ? !show : !panel.hidden;
    if (!panel.hidden) {
      const raf = hostWindow.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
      raf(() => positionPanel());
    }
  }

  async function handleClick(event) {
    const groupChip = event.target.closest('[data-category]');
    if (groupChip) {
      const category = groupChip.dataset.category;
      const selected = settings.selectedCategories || [];
      if (category === '_all_') {
        settings.selectedCategories = [];
      } else {
        if (selected.includes(category)) {
          settings.selectedCategories = selected.filter(c => c !== category);
        } else {
          settings.selectedCategories = [...selected, category];
        }
      }
      await saveSettings();
      renderTab('prompts');
      return;
    }

    const modelSelect = event.target.closest('[data-stg-model-select]');
    if (modelSelect) {
      const model = modelSelect.dataset.stgModelSelect;
      const profile = activeProfile();
      profile.model = model;
      await saveSettings();
      renderTab('api');
      setStatus(`✓ 已选择模型"${model}"`);
      return;
    }

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
    if (action === 'all-worldbooks') {
      settings.selectedWorldbooks = [];
      await saveSettings();
      await updateWorldbookList();
      setStatus('已设为发送全部世界书。');
      return;
    }
    if (action === 'upload-fab-image') {
      root.querySelector('[data-stg-fab-image-upload]').click();
      return;
    }
    if (action === 'remove-fab-image') {
      settings.fabImage = null;
      await saveSettings();
      renderTab('general');
      ensureFab();
      setStatus('✓ 已删除图片');
      return;
    }
    if (action === 'preview-fab-image') {
      if (settings.fabImage) {
        const modal = hostDocument.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#00000080;display:grid;place-items:center;z-index:2147483646;padding:20px';
        const box = hostDocument.createElement('div');
        box.style.cssText = 'background:white;border-radius:8px;padding:20px;text-align:center;max-width:300px';
        box.innerHTML = `<img src="${settings.fabImage}" style="max-width:100%;max-height:300px;border-radius:8px"><p style="margin-top:12px;color:#666">FAB 预览</p><button style="margin-top:8px;padding:8px 16px;background:#86c8b2;color:white;border:none;border-radius:4px;cursor:pointer">关闭</button>`;
        box.querySelector('button').addEventListener('click', () => modal.remove());
        modal.appendChild(box);
        hostDocument.body.appendChild(modal);
      }
      return;
    }

    // 以下操作先尝试从actionElement开始查找theater
    const theater = actionElement.closest('.stg-message-theater');
    if (theater) {
      const messageId = Number(theater.dataset.stgMessageId);
      const message = getMessage(messageId);
      const record = getMessageRecord(message);
      if (!record) return;

      if (action === 'regenerate') {
        await generateForMessage(messageId, { manual: true });
        return;
      }
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
        const textarea = theater.querySelector('[data-stg-field="edit-content"]');
        if (!textarea) return;
        const text = textarea.value;
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
        const oldFavCount = (record.favorites || []).length;
        await updateRecord(messageId, (next) => {
          const item = activeRecordItem(next);
          if (!item) return next;
          const isCurrent = item.id === next.current?.id;

          if (isCurrent) {
            const alreadyFavorite = (next.favorites || []).some((fav) => fav.id === item.id);
            if (alreadyFavorite) {
              next.favorites = (next.favorites || []).filter((fav) => fav.id !== item.id);
              if (next.current) next.current.favorite = false;
            } else {
              const favoriteItem = { ...item, favorite: true };
              next.favorites = [...(next.favorites || []), favoriteItem];
              if (next.current && next.current.id === item.id) next.current.favorite = true;
            }
          } else {
            next.favorites = (next.favorites || []).filter((fav) => fav.id !== item.id);
          }
          return next;
        });
        const newFavCount = (record.favorites || []).length;
        setStatus(newFavCount > oldFavCount ? '✓ 已收藏' : '✓ 已取消收藏');
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
        return;
      }
      return;
    }

    // 其他操作（不需要theater的）
    if (action === 'new-group') {
      const groupName = hostWindow.prompt('请输入新分组名称：', '新分组');
      if (groupName && groupName.trim()) {
        const name = groupName.trim();
        const exists = settings.prompts.some(p => (p.category || '默认') === name);
        if (exists) return setStatus('分组已存在', true);
        settings.prompts.push({
          ...clone(DEFAULT_SETTINGS.prompts[0]),
          id: `prompt-${Date.now()}`,
          name: '新提示词',
          category: name,
          content: '',
          order: settings.prompts.length
        });
        await saveSettings();
        renderTab('prompts');
        setStatus(`✓ 已创建分组"${name}"`);
      }
      return;
    }
    if (action === 'rename-group') {
      const oldName = actionElement.dataset.stgGroup;
      const newName = hostWindow.prompt(`请输入新分组名称（当前:"${oldName}"）:`, oldName);
      if (newName && newName.trim() && newName !== oldName) {
        const trimmed = newName.trim();
        const exists = settings.prompts.some(p => (p.category || '默认') === trimmed);
        if (exists) return setStatus('分组名已被使用', true);
        settings.prompts.forEach(p => {
          if ((p.category || '默认') === oldName) p.category = trimmed;
        });
        await saveSettings();
        renderTab('prompts');
        setStatus(`✓ 已更名为"${trimmed}"`);
      }
      return;
    }
    if (action === 'delete-group') {
      const groupName = actionElement.dataset.stgGroup;
      const prompts = settings.prompts.filter(p => (p.category || '默认') === groupName);
      if (!confirm(`确定要删除分组"${groupName}"及其 ${prompts.length} 条提示词吗？`)) return;
      settings.prompts = settings.prompts.filter(p => (p.category || '默认') !== groupName);
      await saveSettings();
      renderTab('prompts');
      setStatus(`✓ 已删除分组"${groupName}"`);
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
        const modelList = root.querySelector('#stg-model-list');
        if (!modelList) return;
        const profile = activeProfile();
        modelList.innerHTML = models.map(model => `<button type="button" class="stg-model-item ${model === profile.model ? 'selected' : ''}" data-stg-model-select="${escapeAttr(model)}">${escapeHtml(model)}</button>`).join('');
        modelList.style.display = 'block';
        setStatus('✓ 模型列表已加载，点击选择');
      } catch (error) {
        setStatus(`获取模型失败：${error.message || error}`, true);
      }
      return;
    }
    if (action === 'apply-random') {
      const enabledEl = hostDocument.getElementById('stg-random-enabled');
      const countEl = hostDocument.getElementById('stg-random-count');

      if (!enabledEl?.checked) return setStatus('请先启用"启用随机"', true);

      const groups = settings.selectedCategories || [];
      const count = Math.max(1, Math.min(99, parseInt(countEl?.value || '1') || 1));

      let pool = settings.prompts.filter(p => p.enabled && String(p.content || '').trim());
      if (groups.length > 0) {
        pool = pool.filter(p => groups.includes(p.category || '默认'));
      }

      if (!pool.length) {
        return setStatus(groups.length ? `选中分组中没有启用的提示词` : '没有启用的提示词', true);
      }

      settings.randomMode = { enabled: true, groups, count };
      await saveSettings();
      renderTab('prompts');
      const groupNames = groups.length ? groups.join(', ') : '全部';
      setStatus(`✓ 已保存: 从${groupNames}中每次随机抽取${count}条提示词`);
      return;
    }
    if (action === 'new-prompt') {
      settings.prompts.push({ ...clone(DEFAULT_SETTINGS.prompts[0]), id: `prompt-${Date.now()}`, name: `提示词 ${settings.prompts.length + 1}`, content: '', order: settings.prompts.length });
      await saveSettings();
      renderTab('prompts');
      return;
    }
    if (action === 'save-prompt') {
      const row = actionElement.closest('[data-stg-prompt-id]');
      const promptId = row?.dataset.stgPromptId;
      if (promptId) {
        const prompt = settings.prompts.find(p => p.id === promptId);
        if (prompt) {
          const nameInput = row.querySelector('[data-stg-prompt-field="name"]');
          const contentTextarea = row.querySelector('[data-stg-prompt-field="content"]');

          if (nameInput) prompt.name = nameInput.value || '未命名';
          if (contentTextarea) prompt.content = contentTextarea.value;

          await saveSettings();
          setStatus('✓ 提示词已保存');
        }
      }
      return;
    }
    if (action === 'delete-prompt') {
      const row = actionElement.closest('div[data-stg-prompt-id]') || actionElement.closest('button[data-stg-prompt-id]')?.parentElement?.parentElement?.parentElement;
      let promptId = actionElement.dataset.stgPromptId;
      if (!promptId && row) {
        promptId = row.dataset.stgPromptId;
      }
      if (!promptId) {
        promptId = actionElement.closest('button[data-stg-prompt-id]')?.dataset.stgPromptId;
      }
      if (promptId) {
        settings.prompts = settings.prompts.filter((prompt) => prompt.id !== promptId);
        await saveSettings();
        renderTab('prompts');
      }
      return;
    }
    if (action === 'duplicate-prompt') {
      let promptId = null;
      let btn = actionElement;
      while (btn && !promptId) {
        if (btn.dataset?.stgPromptId) promptId = btn.dataset.stgPromptId;
        btn = btn.previousElementSibling;
        if (!btn && actionElement.parentElement) btn = actionElement.parentElement.querySelector('button[data-stg-prompt-id]');
      }
      if (!promptId) {
        for (let el of actionElement.parentElement?.querySelectorAll('[data-stg-prompt-field]') || []) {
          if (el.value) {
            const parentDiv = actionElement.closest('div');
            if (parentDiv) {
              const textarea = parentDiv.querySelector('textarea[data-stg-prompt-field="content"]');
              if (textarea) {
                const allPrompts = settings.prompts;
                for (let p of allPrompts) {
                  if (p.content === textarea.value) promptId = p.id;
                }
              }
            }
          }
        }
      }

      const source = promptId ? settings.prompts.find((prompt) => prompt.id === promptId) : null;
      if (source) {
        settings.prompts.push({ ...clone(source), id: `prompt-${Date.now()}`, name: `${source.name} 副本`, order: settings.prompts.length });
        await saveSettings();
        renderTab('prompts');
      }
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
      const msg = getMessage(id);
      const messageElement = findMessageElement(id);
      const theater = messageElement?.querySelector('.stg-message-theater');
      if (theater) {
        theater.classList.remove('is-folded');
        theater.querySelector('.stg-theater-body').hidden = false;
        theater.querySelector('[data-stg-action="fold"]')?.classList.remove('is-active');
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      togglePanel(false);
      return;
    }
    if (action === 'view-favorite') {
      const favoriteId = actionElement.closest('[data-stg-favorite-id]')?.dataset.stgFavoriteId;
      const messageId = Number(actionElement.closest('[data-stg-favorite-id]')?.dataset.stgMessageId);
      if (messageId !== undefined) {
        const message = getMessage(messageId);
        const record = getMessageRecord(message);
        if (record && favoriteId) {
          record.active = favoriteId;
          await saveMessageRecord(message, record);
          showFavoriteModal(favoriteId, record, messageId);
        }
      }
      return;
    }
    if (action === 'remove-favorite') {
      const favoriteId = actionElement.closest('[data-stg-favorite-id]')?.dataset.stgFavoriteId;
      const messageId = Number(actionElement.closest('[data-stg-favorite-id]')?.dataset.stgMessageId);
      if (messageId !== undefined) {
        const message = getMessage(messageId);
        const record = getMessageRecord(message);
        if (record && favoriteId) {
          record.favorites = (record.favorites || []).filter((fav) => fav.id !== favoriteId);
          if (record.active === favoriteId) record.active = 'current';
          await saveMessageRecord(message, record);
          renderTab('favorites');
        }
      }
      return;
    }
    if (action === 'reset-system-prompt') {
      settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
      await saveSettings();
      renderTab('system');
      setStatus('✓ 已恢复默认系统提示词');
      return;
    }
    if (action === 'clear-logs') {
      logs.length = 0;
      try { localStorage.removeItem(LOG_STORAGE_KEY); } catch {}
      renderTab('logs');
      setStatus('✓ 已清空日志');
      return;
    }
    if (action === 'export-logs') {
      const text = logs.map(log => `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${log.details ? `\n${log.details}` : ''}`).join('\n\n${'-'.repeat(72)}\n\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const link = hostDocument.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stage-theater-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
  }

  async function handleChange(event) {
    const target = event.target;
    if (target.matches('[data-stg-worldbook-name]')) {
      const selected = Array.from(hostDocument.querySelectorAll('[data-stg-worldbook-name]:checked')).map(el => el.value);
      settings.selectedWorldbooks = selected;
      await saveSettings();
      const total = hostDocument.querySelectorAll('[data-stg-worldbook-name]').length;
      const summary = hostDocument.querySelector('[data-stg-worldbook-summary]');
      if (summary) summary.textContent = selected.length ? `已选 ${selected.length} / ${total}` : `发送全部 ${total} 本`;
      return;
    }
    if (target.id === 'stg-random-enabled') {
      if (!target.checked) {
        settings.randomMode = { enabled: false, group: '', count: 1 };
      } else {
        settings.randomMode = { enabled: true, group: settings.randomMode?.group || '', count: settings.randomMode?.count || 1 };
      }
      await saveSettings();
      renderTab('prompts');
      return;
    }
    if (target.id === 'stg-random-group' || target.id === 'stg-random-count') {
      // 实时更新 settings
      if (settings.randomMode?.enabled) {
        if (target.id === 'stg-random-group') settings.randomMode.group = target.value;
        if (target.id === 'stg-random-count') settings.randomMode.count = Math.max(1, parseInt(target.value) || 1);
        await saveSettings();
      }
      return;
    }
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
    if (target.matches('[data-stg-fab-image-upload]') && target.files?.[0]) {
      try {
        const file = target.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          settings.fabImage = e.target.result;
          await saveSettings();
          renderTab('general');
          ensureFab();
          setStatus('✓ 图片已上传');
        };
        reader.readAsDataURL(file);
      } catch (error) {
        setStatus(`上传失败：${error.message || error}`, true);
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
      if (key === 'fabSize') {
        if (!applyFabSize(target.value)) return;
        clearTimeout(fabSizeSaveTimer);
        await saveSettings();
        addLog(`悬浮球大小已保存 · ${settings.fabSize}px`, 'info');
        return;
      }
      if (target.tagName === 'TEXTAREA') {
        settings[key] = target.value;
      } else {
        settings[key] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
      }
      await saveSettings();
      // 如果改变了FAB相关设置，重新应用样式
      if (['fabSize', 'fabShape'].includes(key)) {
        ensureFab();
      }
      // 如果改变了发送世界书设置，更新世界书列表显示
      if (key === 'sendWorldbook') {
        const section = hostDocument.getElementById('stg-worldbooks-section');
        if (section) {
          section.hidden = !settings.sendWorldbook;
          if (settings.sendWorldbook) updateWorldbookList();
        }
      }
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
    if (target.matches('[data-stg-setting="fabSize"]')) {
      if (!applyFabSize(target.value)) return;
      clearTimeout(fabSizeSaveTimer);
      fabSizeSaveTimer = setTimeout(() => saveSettings(), 250);
      return;
    }
    if (target.matches('[data-stg-setting="systemPrompt"]')) {
      settings.systemPrompt = target.value;
      saveSettings();
    }
  }

  function renderAllStoredTheaters() {
    chatMessages().forEach((message, id) => {
      if (getMessageRecord(message)) renderMessageTheater(id);
    });
  }

  function subscribeEvents() {
    if (eventsSubscribed) {
      console.log(`[${PLUGIN_ID}] [诊断] subscribeEvents 已绑定过，跳过`);
      return true;
    }
    const ctx = getContext();
    const events = getEventSource(ctx);
    const types = getEventTypes(ctx);
    console.log(`[${PLUGIN_ID}] [诊断] subscribeEvents 开始，events=${!!events}，types=${!!types}`);
    if (!events?.on || !types) {
      console.log(`[${PLUGIN_ID}] [诊断] subscribeEvents 缺少事件系统，返回false`);
      return false;
    }
    const on = (name, handler) => {
      if (name) {
        try {
          console.log(`[${PLUGIN_ID}] [诊断] subscribeEvents 绑定事件: ${name}`);
          events.on(name, handler);
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] event subscribe failed`, name, error);
        }
      }
    };
    on(types.APP_READY, () => {
      console.log(`[${PLUGIN_ID}] [诊断] APP_READY 事件触发`);
      fire();
    });
    on(types.MESSAGE_RECEIVED, async (messageId, type) => {
      console.log(`[${PLUGIN_ID}] [诊断] MESSAGE_RECEIVED 触发，messageId=${messageId}，type=${type}`);
      const allowed = ['normal', 'regenerate', 'swipe', 'first_message'];
      if (!allowed.includes(type)) {
        console.log(`[${PLUGIN_ID}] [诊断] type="${type}" 不在允许列表中，跳过`);
        return;
      }
      const autoEnabled = getChatAutoEnabled();
      console.log(`[${PLUGIN_ID}] [诊断] 自动生成已启用=${autoEnabled}`);
      if (!autoEnabled) {
        console.log(`[${PLUGIN_ID}] [诊断] 自动生成被禁用，跳过`);
        return;
      }
      console.log(`[${PLUGIN_ID}] [诊断] 准备调用 generateForMessage(${messageId})`);
      await generateForMessage(Number(messageId));
    });
    on(types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
      console.log(`[${PLUGIN_ID}] [诊断] CHARACTER_MESSAGE_RENDERED 触发，messageId=${messageId}`);
      renderMessageTheater(Number(messageId));
    });
    on(types.MESSAGE_UPDATED, (messageId) => {
      console.log(`[${PLUGIN_ID}] [诊断] MESSAGE_UPDATED 触发，messageId=${messageId}`);
      renderMessageTheater(Number(messageId));
    });
    on(types.CHAT_CHANGED, () => {
      console.log(`[${PLUGIN_ID}] [诊断] CHAT_CHANGED 触发`);
      setTimeout(() => {
        renderAllStoredTheaters();
        // 不要重置tab，保持用户当前的tab选择（比如收藏库）
      }, 200);
    });
    eventsSubscribed = true;
    console.log(`[${PLUGIN_ID}] [诊断] subscribeEvents 完成`);
    return true;
  }

  function init() {
    console.log(`[${PLUGIN_ID}] [诊断] init 入口`);
    if (!hostDocument.body) {
      console.log(`[${PLUGIN_ID}] [诊断] hostDocument.body 不存在，返回false`);
      return false;
    }
    try {
      console.log(`[${PLUGIN_ID}] [诊断] 调用 ensureHostStyles`);
      ensureHostStyles();
      console.log(`[${PLUGIN_ID}] [诊断] 调用 mountUI`);
      if (!mountUI()) {
        console.log(`[${PLUGIN_ID}] [诊断] mountUI 失败`);
        return false;
      }
      console.log(`[${PLUGIN_ID}] [诊断] 调用 subscribeEvents`);
      subscribeEvents();
      console.log(`[${PLUGIN_ID}] [诊断] 调用 renderAllStoredTheaters`);
      renderAllStoredTheaters();
      setTimeout(renderAllStoredTheaters, 700);
      if (!observer && typeof hostWindow.MutationObserver === 'function') {
        console.log(`[${PLUGIN_ID}] [诊断] 创建 MutationObserver`);
        observer = new hostWindow.MutationObserver(() => {
          // 仅用于检测聊天区域是否被加载，不主动触发renderAllStoredTheaters
          // 避免无限循环和闪烁问题
        });
        observer.observe(hostDocument.body, { childList: true, subtree: true });
      }
      console.log(`[${PLUGIN_ID}] [诊断] init 完成，返回true`);
      return true;
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] init failed`, error);
      return false;
    }
  }

  let initialized = false;
  let mutationObserverTimer = null;
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
    if (initialized && eventsSubscribed && root?.querySelector(`#${FAB_ID}`)) {
      clearInterval(interval);
    } else if (Date.now() - started > 10000) {
      clearInterval(interval);
    }
  }, 250);

  // 立刻尝试初始化（不依赖事件）
  setTimeout(fire, 100);

  const previousInstance = hostWindow[INSTANCE_KEY];
  if (previousInstance?.destroy) {
    try {
      previousInstance.destroy();
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] previous instance cleanup failed`, error);
    }
  }

  function currentImagePrompts() {
    return Array.from(hostDocument.querySelectorAll('iframe[data-stg-frame-id]')).flatMap((iframe) =>
      (iframe.stgImagePrompts || []).map((entry) => ({ ...entry }))
    );
  }

  function rememberGeneratedImage(entry, imageHtml) {
    if (!Number.isFinite(Number(entry.messageId)) || !entry.itemId) return;
    const message = getMessage(Number(entry.messageId));
    const record = getMessageRecord(message);
    if (!record) return;
    const candidates = [record.current, ...(record.items || []), ...(record.favorites || [])].filter(Boolean);
    let changed = false;
    for (const item of candidates) {
      if (item.id !== entry.itemId) continue;
      item.generatedImages ||= {};
      item.generatedImages[entry.storageKey || entry.raw] = imageHtml;
      changed = true;
    }
    if (changed) saveMessageRecord(message, record);
  }

  function insertGeneratedImage(reference, output) {
    if (Array.isArray(reference)) {
      return reference.reduce((count, item, index) => count + insertGeneratedImage(item, Array.isArray(output) ? output[index] : output), 0);
    }

    let lookup = reference;
    let image = output;
    if (reference && typeof reference === 'object') {
      lookup = reference.slotId || reference.imageToken || reference.imageTokens || reference.token || reference.raw || reference.prompt || reference.tag || '';
      image = output ?? reference.imageHtml ?? reference.html ?? reference.url ?? reference.src ?? reference.imageUrl ?? reference.dataUrl;
    }
    const lookupText = String(lookup || '').trim();
    const html = imageOutputHtml(image);
    if (!lookupText || !html) return 0;

    const prompts = currentImagePrompts();
    let matches = prompts.filter((entry) =>
      entry.slotId === lookupText || entry.raw === lookupText || entry.prompt === lookupText
    );
    if (!matches.length) {
      matches = prompts.filter((entry) => lookupText.includes(entry.raw));
    }

    for (const entry of matches) {
      const iframe = hostDocument.querySelector(`iframe[data-stg-frame-id="${CSS.escape(entry.frameId)}"]`);
      iframe?.contentWindow?.postMessage({
        type: 'stg-insert-image',
        frameId: entry.frameId,
        slotId: entry.slotId,
        imageHtml: html
      }, '*');
      rememberGeneratedImage(entry, html);
    }
    if (matches.length) addLog(`小剧场插图已回填 · ${matches.length} 处`, 'success', lookupText, '查看生图标记');
    return matches.length;
  }

  const instance = {
    getImagePrompts: currentImagePrompts,
    extractImagePrompts,
    insertImage: (imageTokens, imageHtml) => insertGeneratedImage(imageTokens, imageHtml) > 0,
    insertImages: (items) => insertGeneratedImage(items),
    destroy: () => {
      clearTimeout(mutationObserverTimer);
      mutationObserverTimer = null;
      observer?.disconnect?.();
      observer = null;
      unbindHostEvents();
      if (fabResizeHandler) {
        fabResizeWindow?.removeEventListener('resize', fabResizeHandler);
        fabResizeWindow?.visualViewport?.removeEventListener('resize', fabResizeHandler);
        fabResizeWindow?.visualViewport?.removeEventListener('scroll', fabResizeHandler);
        fabResizeHandler = null;
        fabResizeWindow = null;
      }
      fabResizeBound = false;
      hostDocument.getElementById(ROOT_ID)?.remove();
      hostDocument.getElementById(FAB_ID)?.remove();
      hostDocument.getElementById(STYLE_LINK_ID)?.remove();
      hostDocument.querySelectorAll('.stg-modal').forEach((modal) => {
        if (modal.open && typeof modal.close === 'function') modal.close();
        modal.remove();
      });
      hostDocument.removeEventListener('stage-theater:image-ready', handleImageReady);
      hostDocument.removeEventListener('stg-image-ready', handleImageReady);
      hostWindow.removeEventListener('message', handleImageMessage);
      if (hostWindow[INSTANCE_KEY] === instance) delete hostWindow[INSTANCE_KEY];
      if (hostWindow.stageTheaterImageBridge === instance) delete hostWindow.stageTheaterImageBridge;
    }
  };

  function handleImageReady(event) {
    insertGeneratedImage(event.detail, event.detail?.imageHtml ?? event.detail?.html ?? event.detail?.url);
  }

  function handleImageMessage(event) {
    if (!['stage-theater:image-ready', 'stg-image-ready'].includes(event.data?.type)) return;
    insertGeneratedImage(event.data, event.data.imageHtml ?? event.data.html ?? event.data.url);
  }

  hostDocument.addEventListener('stage-theater:image-ready', handleImageReady);
  hostDocument.addEventListener('stg-image-ready', handleImageReady);
  hostWindow.addEventListener('message', handleImageMessage);
  hostWindow[INSTANCE_KEY] = instance;
  hostWindow.stageTheaterImageBridge = instance;
  hostWindow.addEventListener('pagehide', () => {
    if (hostWindow[INSTANCE_KEY] === instance) instance.destroy();
  }, { once: true });
})();
