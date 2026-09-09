const PLUGIN_ID = 'stage-theater';
const PLUGIN_VERSION = '1.0.0';

let stCtx = null;
let stEventSource = null;
let stEventTypes = null;
let stExtensionSettings = null;
let initialized = false;

// ============ 初始化（按底稿规范）============
function getSTContext() {
  try {
    const ctx = SillyTavern?.getContext?.();
    return {
      chat: ctx?.chat || [],
      chatMetadata: ctx?.chatMetadata || {},
      saveChat: typeof ctx?.saveChat === 'function' ? ctx.saveChat : null,
      saveMetadata: typeof ctx?.saveMetadata === 'function' ? ctx.saveMetadata : null,
    };
  } catch (e) {
    console.warn('[ST] getSTContext error:', e);
    return { chat: [], chatMetadata: {}, saveChat: null, saveMetadata: null };
  }
}

function initializePlugin() {
  if (initialized) return;

  try {
    stCtx = SillyTavern?.getContext?.();
    stEventSource = stCtx?.eventSource || window.eventSource;
    stEventTypes = stCtx?.event_types || window.event_types;
    stExtensionSettings = stCtx?.extensionSettings || window.extension_settings;

    if (!stExtensionSettings) {
      stExtensionSettings = window.extension_settings || {};
    }

    // 初始化插件设置
    if (!stExtensionSettings[PLUGIN_ID]) {
      stExtensionSettings[PLUGIN_ID] = {
        enabled: false, // 默认关闭
        apiBaseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.9,
        maxTokens: 800,
        contextDepth: 10,
        sendWorldBook: false,
        promptLibrary: [],
        chatPromptLibrary: {},
      };
    }

    // 从 localStorage 恢复设置（优先）
    const stored = localStorage.getItem(`${PLUGIN_ID}_settings`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        Object.assign(stExtensionSettings[PLUGIN_ID], data);
      } catch (e) {
        console.warn('[ST] localStorage 解析失败:', e);
      }
    }

    // 挂载 UI
    mountUI();

    // 订阅 AI 回复事件
    subscribeToMessageEvents();

    initialized = true;
    console.log('[ST] 插件初始化完成 v' + PLUGIN_VERSION);
  } catch (e) {
    console.warn('[ST] 初始化失败:', e);
  }
}

// ============ 事件订阅（监听 AI 回复）============
function subscribeToMessageEvents() {
  if (!stEventSource || !stEventTypes) return;

  const eventName = stEventTypes.MESSAGE_RECEIVED || 'MESSAGE_RECEIVED';

  if (typeof stEventSource.on === 'function') {
    stEventSource.on(eventName, handleMessageReceived);
  }
}

async function handleMessageReceived(eventData) {
  if (!stExtensionSettings[PLUGIN_ID]?.enabled) return;

  try {
    const ctx = getSTContext();
    if (!ctx.chat || ctx.chat.length === 0) return;

    // 从后往前找最后一条 AI 消息
    let aiMessage = null;
    let aiMessageIndex = -1;
    for (let i = ctx.chat.length - 1; i >= 0; i--) {
      const msg = ctx.chat[i];
      if (!msg.is_user && msg.role !== 'system' && (msg.mes || msg.content)) {
        aiMessage = msg;
        aiMessageIndex = i;
        break;
      }
    }

    if (!aiMessage) return;

    // 初始化此聊天的小剧场存储
    if (!ctx.chatMetadata.extensions) {
      ctx.chatMetadata.extensions = {};
    }
    if (!ctx.chatMetadata.extensions[PLUGIN_ID]) {
      ctx.chatMetadata.extensions[PLUGIN_ID] = {
        messages: {},
      };
    }

    const settings = stExtensionSettings[PLUGIN_ID];
    const aiText = aiMessage.mes || aiMessage.content || '';

    // 收集发给 API 的内容
    const selectedPrompts = settings.promptLibrary.filter(p => p.enabled);
    if (selectedPrompts.length === 0) {
      console.warn('[ST] 没有启用的提示词');
      return;
    }

    // 构建上下文
    const contextMessages = [];

    // 必须：用户上一条消息
    for (let i = aiMessageIndex - 1; i >= 0; i--) {
      const msg = ctx.chat[i];
      if (msg.is_user && (msg.mes || msg.content)) {
        contextMessages.unshift({
          role: 'user',
          content: msg.mes || msg.content,
        });
        break;
      }
    }

    // 可选：最近聊天上下文（默认 10 条）
    const depth = Math.min(Math.max(0, settings.contextDepth), 20);
    const startIdx = Math.max(0, aiMessageIndex - depth);
    for (let i = startIdx; i < aiMessageIndex; i++) {
      const msg = ctx.chat[i];
      if (msg.mes || msg.content) {
        contextMessages.push({
          role: msg.is_user ? 'user' : 'assistant',
          content: msg.mes || msg.content,
        });
      }
    }

    // 可选：世界书
    let worldBookText = '';
    if (settings.sendWorldBook) {
      worldBookText = getEnabledWorldBook();
    }

    // 可选：角色卡设定
    let characterData = '';
    try {
      const charCard = ctx.characterCard || {};
      if (charCard.data?.description) {
        characterData = charCard.data.description;
      }
    } catch (e) {
      console.warn('[ST] 无法获取角色卡:', e);
    }

    // 合并多条提示词
    const mergedPrompt = mergePrompts(selectedPrompts);

    // 调用 API 生成小剧场
    const result = await callTheatreAPI(mergedPrompt, aiText, characterData, worldBookText, contextMessages);

    if (result) {
      // 保存结果到聊天元数据
      const messageId = aiMessage.id || `msg_${aiMessageIndex}_${Date.now()}`;
      if (!ctx.chatMetadata.extensions[PLUGIN_ID].messages) {
        ctx.chatMetadata.extensions[PLUGIN_ID].messages = {};
      }
      ctx.chatMetadata.extensions[PLUGIN_ID].messages[messageId] = {
        theatreContent: result,
        timestamp: Date.now(),
        collapsed: false,
        favorite: false,
      };

      // 保存聊天
      if (typeof ctx.saveChat === 'function') {
        ctx.saveChat();
      }

      // 渲染结果窗口
      renderTheatreWindow(messageId, aiMessage);
    }
  } catch (e) {
    console.warn('[ST] 消息处理失败:', e);
  }
}

// ============ API 调用（OpenAI 兼容）============
async function callTheatreAPI(prompt, aiText, characterData, worldBook, contextMessages) {
  const settings = stExtensionSettings[PLUGIN_ID];

  if (!settings.apiBaseUrl || !settings.apiKey || !settings.model) {
    console.warn('[ST] API 配置不完整');
    return null;
  }

  const baseUrl = String(settings.apiBaseUrl).replace(/\/+$/, '');
  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(prompt, characterData, worldBook),
    },
    {
      role: 'user',
      content: aiText,
    },
    ...contextMessages,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    let response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        messages: messages,
      }),
      signal: controller.signal,
    });

    // 如果失败，尝试带 /v1 前缀
    if (!response.ok && !baseUrl.includes('/v1')) {
      response = await fetch(baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey,
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          messages: messages,
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      console.warn('[ST] HTTP', response.status);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn('[ST] API 请求失败:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(prompt, characterData, worldBook) {
  let full = prompt;

  if (characterData) {
    full = `角色设定：\n${characterData}\n\n${full}`;
  }

  if (worldBook) {
    full = `${full}\n\n世界观：\n${worldBook}`;
  }

  return full;
}

function mergePrompts(selectedPrompts) {
  if (selectedPrompts.length === 0) return '';
  if (selectedPrompts.length === 1) return selectedPrompts[0].content;

  // 合并多条提示词
  const promptTexts = selectedPrompts.map(p => p.content).join('\n\n');
  return `请根据以下${selectedPrompts.length}条场景提示词，分别生成对应的小剧场内容。使用 HTML/Markdown 自由排版，每个小剧场用明显分隔符区分：\n\n${promptTexts}`;
}

function getEnabledWorldBook() {
  try {
    const ctx = getSTContext();
    // 这里需要从酒馆上下文获取世界书内容
    // 由于不同版本暴露方式不同，用多个选择器兜底
    if (ctx.worldBook) return ctx.worldBook;
    if (window.worldBook) return window.worldBook;
    return '';
  } catch (e) {
    console.warn('[ST] 无法获取世界书:', e);
    return '';
  }
}

// ============ UI 挂载（悬浮球 + 结果窗口）============
function mountUI() {
  const rootId = 'st-root';
  if (document.getElementById(rootId)) return;

  const root = document.createElement('div');
  root.id = rootId;
  root.innerHTML = `
    <!-- 悬浮球 -->
    <div class="st-fab" id="st-fab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    </div>

    <!-- 悬浮球展开面板 -->
    <div class="st-panel" id="st-panel" style="display:none;">
      <div class="st-panel-header">
        <h3>小剧场</h3>
        <button class="st-close-btn" data-action="close-panel">✕</button>
      </div>

      <div class="st-panel-content">
        <!-- 开关 -->
        <div class="st-section">
          <label>
            <input type="checkbox" class="st-toggle-auto" data-setting="enabled" />
            启用自动生成小剧场
          </label>
        </div>

        <!-- API 设置 -->
        <div class="st-section">
          <h4>API 配置</h4>
          <input type="text" class="st-api-input" placeholder="API 地址（如 https://api.openai.com）" data-setting="apiBaseUrl" />
          <input type="password" class="st-api-input" placeholder="API Key" data-setting="apiKey" />
          <input type="text" class="st-api-input" placeholder="模型名称" data-setting="model" />
          <button class="st-btn" data-action="get-models">获取模型列表</button>
        </div>

        <!-- 生成参数 -->
        <div class="st-section">
          <h4>生成参数</h4>
          <label>
            温度 (0-1):
            <input type="number" class="st-param-input" min="0" max="1" step="0.1" data-setting="temperature" placeholder="0.9" />
          </label>
          <label>
            最大长度:
            <input type="number" class="st-param-input" min="100" max="4000" step="100" data-setting="maxTokens" placeholder="800" />
          </label>
        </div>

        <!-- 上下文设置 -->
        <div class="st-section">
          <h4>上下文设置</h4>
          <label>
            上下文深度 (0-20 条):
            <input type="number" class="st-param-input" min="0" max="20" step="1" data-setting="contextDepth" placeholder="10" />
          </label>
          <label>
            <input type="checkbox" class="st-toggle-setting" data-setting="sendWorldBook" />
            发送启用的世界书
          </label>
        </div>

        <!-- 提示词库 -->
        <div class="st-section">
          <h4>小剧场提示词库</h4>
          <div class="st-prompt-list" id="st-prompt-list"></div>
          <button class="st-btn" data-action="add-prompt">+ 添加提示词</button>
          <button class="st-btn" data-action="import-prompts">导入 JSON</button>
        </div>

        <!-- 生成记录 -->
        <div class="st-section">
          <h4>最近生成记录</h4>
          <div class="st-history" id="st-history"></div>
        </div>

        <!-- 手动生成 -->
        <div class="st-section">
          <button class="st-btn st-btn-primary" data-action="manual-generate">手动生成当前消息</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // 事件委托
  document.addEventListener('click', handleUIClick);
  document.addEventListener('change', handleUIChange);
  document.addEventListener('input', handleUIInput);

  renderPromptLibrary();
}

function handleUIClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'close-panel':
      togglePanel(false);
      break;
    case 'get-models':
      getModelList();
      break;
    case 'add-prompt':
      addPrompt();
      break;
    case 'import-prompts':
      importPrompts();
      break;
    case 'manual-generate':
      manualGenerate();
      break;
    case 'delete-prompt':
      deletePrompt(target.closest('.st-prompt-item')?.dataset.id);
      break;
    case 'toggle-prompt':
      togglePrompt(target.closest('.st-prompt-item')?.dataset.id);
      break;
    case 'regenerate-theatre':
      regenerateTheatre(target.dataset.messageId);
      break;
    case 'collapse-theatre':
      collapseTheatre(target.dataset.messageId);
      break;
    case 'copy-theatre':
      copyTheatre(target.dataset.messageId);
      break;
    case 'favorite-theatre':
      favoriteTheatre(target.dataset.messageId);
      break;
    case 'delete-theatre':
      deleteTheatre(target.dataset.messageId);
      break;
  }
}

function handleUIChange(e) {
  const input = e.target;
  if (input.classList.contains('st-toggle-auto') || input.classList.contains('st-toggle-setting')) {
    const setting = input.dataset.setting;
    stExtensionSettings[PLUGIN_ID][setting] = input.checked;
    saveSettings();
  }
}

function handleUIInput(e) {
  const input = e.target;
  if (input.classList.contains('st-api-input') || input.classList.contains('st-param-input')) {
    const setting = input.dataset.setting;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    stExtensionSettings[PLUGIN_ID][setting] = value;
    saveSettings();
  }
}

function togglePanel(show = null) {
  const panel = document.getElementById('st-panel');
  if (!panel) return;

  if (show === null) {
    show = panel.style.display === 'none';
  }

  panel.style.display = show ? 'block' : 'none';
}

function saveSettings() {
  if (typeof window.saveSettingsDebounced === 'function') {
    window.saveSettingsDebounced();
  }
  localStorage.setItem(`${PLUGIN_ID}_settings`, JSON.stringify(stExtensionSettings[PLUGIN_ID]));
}

function renderPromptLibrary() {
  const list = document.getElementById('st-prompt-list');
  if (!list) return;

  const prompts = stExtensionSettings[PLUGIN_ID].promptLibrary || [];
  list.innerHTML = prompts.map(p => `
    <div class="st-prompt-item" data-id="${p.id}">
      <input type="checkbox" class="st-prompt-checkbox" ${p.enabled ? 'checked' : ''} data-action="toggle-prompt" />
      <div class="st-prompt-info">
        <div class="st-prompt-name">${escapeHTML(p.name)}</div>
        <div class="st-prompt-preview">${escapeHTML(p.content.substring(0, 50))}</div>
      </div>
      <button class="st-btn-sm" data-action="delete-prompt">删除</button>
    </div>
  `).join('');
}

function addPrompt() {
  const name = prompt('提示词名称:');
  if (!name) return;

  const content = prompt('提示词内容:');
  if (!content) return;

  const id = `prompt_${Date.now()}`;
  stExtensionSettings[PLUGIN_ID].promptLibrary.push({
    id,
    name,
    content,
    enabled: true,
  });

  saveSettings();
  renderPromptLibrary();
}

function deletePrompt(id) {
  if (!id || !confirm('确定删除此提示词?')) return;

  const library = stExtensionSettings[PLUGIN_ID].promptLibrary;
  const idx = library.findIndex(p => p.id === id);
  if (idx !== -1) {
    library.splice(idx, 1);
    saveSettings();
    renderPromptLibrary();
  }
}

function togglePrompt(id) {
  if (!id) return;

  const prompt = stExtensionSettings[PLUGIN_ID].promptLibrary.find(p => p.id === id);
  if (prompt) {
    prompt.enabled = !prompt.enabled;
    saveSettings();
    renderPromptLibrary();
  }
}

function importPrompts() {
  const json = prompt('粘贴 JSON（格式: [{"name":"xxx","content":"xxx"}, ...]）:');
  if (!json) return;

  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) throw new Error('必须是数组');

    data.forEach(item => {
      if (item.name && item.content) {
        stExtensionSettings[PLUGIN_ID].promptLibrary.push({
          id: `prompt_${Date.now()}_${Math.random()}`,
          name: item.name,
          content: item.content,
          enabled: true,
        });
      }
    });

    saveSettings();
    renderPromptLibrary();
    alert('导入成功');
  } catch (e) {
    alert('JSON 格式错误: ' + e.message);
  }
}

async function getModelList() {
  const settings = stExtensionSettings[PLUGIN_ID];
  if (!settings.apiBaseUrl || !settings.apiKey) {
    alert('请先填写 API 地址和 Key');
    return;
  }

  try {
    const baseUrl = String(settings.apiBaseUrl).replace(/\/+$/, '');
    let response = await fetch(baseUrl + '/models', {
      headers: {
        'Authorization': 'Bearer ' + settings.apiKey,
      },
    });

    if (!response.ok && !baseUrl.includes('/v1')) {
      response = await fetch(baseUrl + '/v1/models', {
        headers: {
          'Authorization': 'Bearer ' + settings.apiKey,
        },
      });
    }

    if (!response.ok) {
      alert('获取模型列表失败: HTTP ' + response.status);
      return;
    }

    const data = await response.json();
    const models = data.data?.map(m => m.id) || [];

    if (models.length === 0) {
      alert('没有可用模型');
      return;
    }

    const modelStr = models.join('\n');
    const selected = prompt('可用模型:\n' + modelStr + '\n\n请输入要使用的模型名称:', models[0]);

    if (selected) {
      settings.model = selected;
      saveSettings();
      alert('模型已设置: ' + selected);
    }
  } catch (e) {
    alert('获取模型列表失败: ' + e.message);
  }
}

function manualGenerate() {
  const ctx = getSTContext();
  if (!ctx.chat || ctx.chat.length === 0) {
    alert('没有消息');
    return;
  }

  // 找最后一条 AI 消息
  let aiMessage = null;
  for (let i = ctx.chat.length - 1; i >= 0; i--) {
    if (!ctx.chat[i].is_user && ctx.chat[i].role !== 'system') {
      aiMessage = ctx.chat[i];
      break;
    }
  }

  if (!aiMessage) {
    alert('没有 AI 消息');
    return;
  }

  handleMessageReceived(null);
}

// ============ 结果窗口（紧贴消息下方）============
function renderTheatreWindow(messageId, aiMessage) {
  // 找到对应的 AI 消息 DOM 容器
  const messageEl = findAIMessageElement(aiMessage);
  if (!messageEl) {
    console.warn('[ST] 找不到消息 DOM 元素');
    return;
  }

  // 删除旧的小剧场窗口（替换而不是新增）
  const oldWindow = messageEl.querySelector('.st-theatre-window');
  if (oldWindow) oldWindow.remove();

  const ctx = getSTContext();
  const theatreData = ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages?.[messageId];

  if (!theatreData) return;

  const windowEl = document.createElement('div');
  windowEl.className = 'st-theatre-window';
  windowEl.innerHTML = `
    <div class="st-theatre-header">
      <div class="st-theatre-title">小剧场</div>
      <div class="st-theatre-actions">
        <button class="st-theatre-btn" data-action="regenerate-theatre" data-message-id="${messageId}" title="重新生成">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0A9 9 0 0 0 3 12M9 6l-3 3m0 0l3 3"/></svg>
        </button>
        <button class="st-theatre-btn" data-action="copy-theatre" data-message-id="${messageId}" title="复制">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>
        </button>
        <button class="st-theatre-btn" data-action="favorite-theatre" data-message-id="${messageId}" title="收藏">
          <svg viewBox="0 0 24 24" fill="${theatreData.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 10.26 23.84 11.52 17.77 17.77 19.16 26.13 12 22.77 4.84 26.13 6.23 17.77 0.16 11.52 8.91 10.26 12 2"/></svg>
        </button>
        <button class="st-theatre-btn" data-action="collapse-theatre" data-message-id="${messageId}" title="折叠">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
    </div>
    <div class="st-theatre-content">
      ${theatreData.theatreContent}
    </div>
    <div class="st-theatre-footer">
      <button class="st-theatre-btn-sm" data-action="delete-theatre" data-message-id="${messageId}">删除此条</button>
    </div>
  `;

  // 挂在消息下方
  messageEl.insertAdjacentElement('afterend', windowEl);

  // 重新绑定事件委托
  document.addEventListener('click', handleTheatreAction);
}

function handleTheatreAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !btn.dataset.messageId) return;

  const messageId = btn.dataset.messageId;
  const action = btn.dataset.action;

  switch (action) {
    case 'regenerate-theatre':
      regenerateTheatre(messageId);
      break;
    case 'copy-theatre':
      copyTheatre(messageId);
      break;
    case 'favorite-theatre':
      favoriteTheatre(messageId);
      break;
    case 'collapse-theatre':
      collapseTheatre(messageId);
      break;
    case 'delete-theatre':
      deleteTheatre(messageId);
      break;
  }
}

function regenerateTheatre(messageId) {
  const ctx = getSTContext();
  if (!ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages?.[messageId]) return;

  // 重新生成（调用 API）
  // 这里需要重新读取原始 AI 消息和提示词，重新调用 API
  alert('重新生成功能需要完整实现上下文恢复');
}

function copyTheatre(messageId) {
  const ctx = getSTContext();
  const content = ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages?.[messageId]?.theatreContent;

  if (!content) return;

  navigator.clipboard.writeText(content).then(() => {
    alert('已复制');
  }).catch(err => {
    console.warn('[ST] 复制失败:', err);
  });
}

function favoriteTheatre(messageId) {
  const ctx = getSTContext();
  const msg = ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages?.[messageId];

  if (!msg) return;

  msg.favorite = !msg.favorite;
  if (typeof ctx.saveChat === 'function') {
    ctx.saveChat();
  }

  // 刷新 UI
  const window = document.querySelector(`[data-message-id="${messageId}"]`)?.closest('.st-theatre-window');
  if (window) {
    renderTheatreWindow(messageId, null);
  }
}

function collapseTheatre(messageId) {
  const ctx = getSTContext();
  const msg = ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages?.[messageId];

  if (!msg) return;

  msg.collapsed = !msg.collapsed;
  if (typeof ctx.saveChat === 'function') {
    ctx.saveChat();
  }

  // 刷新 UI
  const content = document.querySelector(`[data-message-id="${messageId}"]`)?.closest('.st-theatre-window')?.querySelector('.st-theatre-content');
  if (content) {
    content.style.display = msg.collapsed ? 'none' : 'block';
  }
}

function deleteTheatre(messageId) {
  if (!confirm('确定删除此小剧场?')) return;

  const ctx = getSTContext();
  if (ctx.chatMetadata.extensions?.[PLUGIN_ID]?.messages) {
    delete ctx.chatMetadata.extensions[PLUGIN_ID].messages[messageId];

    if (typeof ctx.saveChat === 'function') {
      ctx.saveChat();
    }

    // 删除 DOM
    document.querySelector(`[data-message-id="${messageId}"]`)?.closest('.st-theatre-window')?.remove();
  }
}

function findAIMessageElement(aiMessage) {
  // 尝试多种选择器找到对应的消息 DOM 元素
  const selectors = [
    `.mes[data-name="${aiMessage.name}"]`,
    `[data-message-id*="${aiMessage.id}"]`,
    '.mes:last-child',
    '.message-group:last-child .mes',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  return null;
}

// ============ 工具函数============
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ 启动============
function startPlugin() {
  const fire = () => {
    initializePlugin();
  };

  if (stEventSource && stEventTypes && stEventTypes.APP_READY) {
    stEventSource.on(stEventTypes.APP_READY, fire);
  }

  // 轮询兜底
  const t0 = Date.now();
  const iv = setInterval(() => {
    const ok = !!(window.extension_settings || window.SillyTavern);
    if (ok || Date.now() - t0 > 3500) {
      clearInterval(iv);
      fire();
    }
  }, 250);
}

// 启动
startPlugin();
