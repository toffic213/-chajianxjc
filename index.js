/* Stage Theater Plugin - Main Logic */

const PLUGIN_ID = 'stage-theater';
const PLUGIN_VERSION = '1.0.0';

// Default settings structure
const DEFAULT_SETTINGS = {
  enabled: false,
  apiProfiles: [
    {
      id: 'default',
      name: 'Default',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4',
      temperature: 0.9,
      maxTokens: 800,
    },
  ],
  currentProfileId: 'default',
  promptLibrary: [
    {
      id: 'default-001',
      name: 'Default Theater',
      content: 'Based on the following dialogue, create a short theater scene (小剧场) with visual descriptions and emotional reactions.',
      enabled: true,
      category: 'default',
    },
  ],
  contextDepth: 10,
  sendWorldBook: false,
  sendCharacterCard: true,
  autoGenerate: false,
  mergePrompts: true,
  showHistoryOnLoad: true,
  maxHistoryPerChat: 10,
};

let ctx = null;
let eventSource = null;
let event_types = null;
let extension_settings = null;
let pluginSettings = {};
let theatersMap = new Map(); // Map<messageIndex, theaterData>
let currentAIMsgIndex = null;
let isGenerating = false;

// ============ 初始化 ============
function initPlugin() {
  try {
    ctx = SillyTavern.getContext?.();
    eventSource = ctx?.eventSource || window.eventSource;
    event_types = ctx?.event_types || window.event_types;
    extension_settings = ctx?.extensionSettings || window.extension_settings;

    if (!extension_settings) {
      console.warn('[ST] 无法获取 extension_settings');
      return;
    }

    // 从 localStorage 加载设置（优先级更高）
    const storedSettings = localStorage.getItem(`${PLUGIN_ID}:settings`);
    if (storedSettings) {
      pluginSettings = JSON.parse(storedSettings);
    } else {
      pluginSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(`${PLUGIN_ID}:settings`, JSON.stringify(pluginSettings));
    }

    // 同时保存到 extension_settings（酒馆兼容）
    if (!extension_settings[PLUGIN_ID]) {
      extension_settings[PLUGIN_ID] = pluginSettings;
    } else {
      pluginSettings = Object.assign({}, DEFAULT_SETTINGS, extension_settings[PLUGIN_ID]);
    }

    mountUI();
    attachEventListeners();
    loadChatTheaters();
  } catch (e) {
    console.warn('[Stage Theater] 初始化失败:', e);
  }
}

// ============ 挂载UI ============
function mountUI() {
  const rootId = 'st-root';
  if (document.getElementById(rootId)) return;

  const root = document.createElement('div');
  root.id = rootId;
  root.innerHTML = `
    <button class="st-fab" id="st-fab" title="Stage Theater">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v10M7 12h10"/>
      </svg>
    </button>
    <div class="st-panel" id="st-panel">
      <div class="st-panel-header">
        <h3>🎭 小剧场</h3>
        <button class="st-panel-close" id="st-panel-close">
          <svg viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="st-tabs">
        <button class="st-tab active" data-tab="settings">设置</button>
        <button class="st-tab" data-tab="prompts">提示词库</button>
        <button class="st-tab" data-tab="api">API配置</button>
        <button class="st-tab" data-tab="history">历史记录</button>
      </div>
      <div class="st-panel-content" id="st-panel-content">
        <!-- 内容由JS动态生成 -->
      </div>
    </div>
    <div class="st-dialog" id="st-dialog">
      <div class="st-dialog-content" id="st-dialog-inner">
        <!-- 对话框内容由JS动态生成 -->
      </div>
    </div>
  `;

  document.body.appendChild(root);
}

// ============ 事件绑定 ============
function attachEventListeners() {
  const fab = document.getElementById('st-fab');
  const panel = document.getElementById('st-panel');
  const panelClose = document.getElementById('st-panel-close');
  const tabs = document.querySelectorAll('.st-tab');

  if (fab) {
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('show');
    });
  }

  if (panelClose) {
    panelClose.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('show');
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderPanelContent(tab.dataset.tab);
    });
  });

  // 事件委托：点击面板外关闭
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#st-root')) {
      panel.classList.remove('show');
    }
  });

  // 监听 AI 回复完成事件
  if (eventSource && event_types) {
    eventSource.on(event_types.MESSAGE_RECEIVED, handleAIMessageReceived);
  }

  // 初始化时刷新面板内容
  renderPanelContent('settings');
}

// ============ 处理 AI 消息接收 ============
async function handleAIMessageReceived(data) {
  try {
    if (!pluginSettings.enabled) return;
    if (!ctx || !ctx.chat) return;

    // 找最后一条 AI 回复
    const lastAIMsgIdx = findLastAIMessage();
    if (lastAIMsgIdx === null) return;

    currentAIMsgIndex = lastAIMsgIdx;

    // 如果当前聊天禁用了自动生成，则跳过
    if (isChatDisabled()) return;

    if (pluginSettings.autoGenerate) {
      await generateTheater(lastAIMsgIdx);
    }
  } catch (e) {
    console.warn('[Stage Theater] 处理消息失败:', e);
  }
}

// ============ 查找最后一条 AI 消息 ============
function findLastAIMessage() {
  if (!ctx || !ctx.chat) return null;

  for (let i = ctx.chat.length - 1; i >= 0; i--) {
    const msg = ctx.chat[i];
    if (!msg.is_user && msg.role !== 'system' && msg.extra?.type !== 'narrator') {
      return i;
    }
  }
  return null;
}

// ============ 检查当前聊天是否禁用 ============
function isChatDisabled() {
  try {
    const chatId = ctx?.chatId || ctx?.chat_id;
    if (!chatId) return false;

    const disabledChats = JSON.parse(
      localStorage.getItem(`${PLUGIN_ID}:disabled_chats`) || '[]'
    );
    return disabledChats.includes(chatId);
  } catch (e) {
    return false;
  }
}

// ============ 生成小剧场 ============
async function generateTheater(msgIndex) {
  try {
    if (isGenerating) return;
    isGenerating = true;

    const aiMsg = ctx.chat[msgIndex];
    if (!aiMsg) {
      isGenerating = false;
      return;
    }

    // 获取启用的提示词
    const enabledPrompts = pluginSettings.promptLibrary.filter((p) => p.enabled);
    if (enabledPrompts.length === 0) {
      console.warn('[ST] 没有启用的提示词');
      isGenerating = false;
      return;
    }

    // 合并提示词
    const mergedPrompt = mergeProprompts(enabledPrompts);

    // 构建上下文
    const contextMessages = buildContextMessages(msgIndex);
    const charCard = getCharacterCardInfo();

    // 构建请求消息
    const systemPrompt = `${mergedPrompt}\n\nCharacter Info:\n${charCard}`;
    const userContent = contextMessages;

    // 获取小剧场内容
    const result = await callLLM(systemPrompt, userContent);

    if (result) {
      const theaterData = {
        id: `theater_${Date.now()}`,
        msgIndex: msgIndex,
        content: result,
        timestamp: Date.now(),
        promptIds: enabledPrompts.map((p) => p.id),
      };

      theatersMap.set(msgIndex, theaterData);
      saveTheaterToChat(msgIndex, theaterData);
      renderTheaterWindow(msgIndex);
    }

    isGenerating = false;
  } catch (e) {
    console.warn('[ST] 生成失败:', e);
    isGenerating = false;
  }
}

// ============ 合并提示词 ============
function mergeProprompts(prompts) {
  if (prompts.length === 1) {
    return prompts[0].content;
  }

  return `Generate ${prompts.length} small theater scenes based on the following prompt templates:\n\n${prompts
    .map((p, i) => `Scene ${i + 1}: ${p.content}`)
    .join('\n\n')}\n\nFormat the output with clear separation between scenes, using HTML or markdown for better readability.`;
}

// ============ 构建上下文消息 ============
function buildContextMessages(msgIndex) {
  let context = '';

  // 获取角色卡信息
  const charCard = getCharacterCardInfo();
  context += `Character: ${charCard}\n\n`;

  // 获取指定深度的聊天历史
  const depth = pluginSettings.contextDepth || 10;
  const startIdx = Math.max(0, msgIndex - depth);

  context += 'Recent chat history:\n';
  for (let i = startIdx; i <= msgIndex; i++) {
    const msg = ctx.chat[i];
    if (msg) {
      const speaker = msg.is_user ? 'User' : (msg.name || 'AI');
      const content = msg.mes || msg.content || '';
      context += `${speaker}: ${content}\n`;
    }
  }

  // 如果启用世界书，添加内容
  if (pluginSettings.sendWorldBook) {
    const worldBookContent = getEnabledWorldBookContent();
    if (worldBookContent) {
      context += `\nWorld Info:\n${worldBookContent}`;
    }
  }

  return context;
}

// ============ 获取角色卡信息 ============
function getCharacterCardInfo() {
  try {
    if (!ctx || !ctx.characterData) return 'Unknown Character';

    const char = ctx.characterData;
    const info = [
      `Name: ${char.name || char.data?.name || 'Unknown'}`,
      `Personality: ${char.personality || char.data?.personality || ''}`,
      `Description: ${char.description || char.data?.description || ''}`,
    ].filter((s) => s.trim().length > 0);

    return info.join('\n');
  } catch (e) {
    return 'Unknown Character';
  }
}

// ============ 获取启用的世界书内容 ============
function getEnabledWorldBookContent() {
  try {
    if (!ctx || !ctx.worldInfo) return '';

    const entries = ctx.worldInfo
      .filter((entry) => !entry.disable && entry.content)
      .map((entry) => `[${entry.key.join(', ')}]\n${entry.content}`)
      .join('\n\n');

    return entries;
  } catch (e) {
    return '';
  }
}

// ============ 调用 LLM ============
async function callLLM(systemPrompt, userContent) {
  try {
    const profile = pluginSettings.apiProfiles.find(
      (p) => p.id === pluginSettings.currentProfileId
    );
    if (!profile) {
      console.warn('[ST] 未找到 API 配置');
      return null;
    }

    const baseUrl = String(profile.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl || !profile.apiKey) {
      console.warn('[ST] API 配置不完整');
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      let url = `${baseUrl}/chat/completions`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${profile.apiKey}`,
        },
        body: JSON.stringify({
          model: profile.model || 'gpt-4',
          temperature: profile.temperature || 0.9,
          max_tokens: profile.maxTokens || 800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn('[ST] HTTP', res.status);
        return null;
      }

      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('[ST] LLM 调用失败:', e);
    return null;
  }
}

// ============ 保存小剧场到聊天 ============
function saveTheaterToChat(msgIndex, theaterData) {
  try {
    if (!ctx || !ctx.chat) return;

    // 保存到聊天消息的 metadata
    const msg = ctx.chat[msgIndex];
    if (!msg) return;

    if (!msg.extra) msg.extra = {};
    if (!msg.extra[PLUGIN_ID]) msg.extra[PLUGIN_ID] = {};

    msg.extra[PLUGIN_ID].theater = theaterData;

    // 保存聊天
    if (typeof ctx.saveChat === 'function') {
      ctx.saveChat();
    } else if (typeof window.saveChat === 'function') {
      window.saveChat();
    }
  } catch (e) {
    console.warn('[ST] 保存小剧场失败:', e);
  }
}

// ============ 渲染小剧场窗口 ============
function renderTheaterWindow(msgIndex) {
  try {
    if (!ctx || !ctx.chat) return;

    const msg = ctx.chat[msgIndex];
    if (!msg || !msg.extra || !msg.extra[PLUGIN_ID]?.theater) return;

    const theaterData = msg.extra[PLUGIN_ID].theater;
    const msgElement = document.querySelector(`[data-message-index="${msgIndex}"]`);

    if (!msgElement) return;

    // 查找或创建小剧场容器
    let theaterContainer = msgElement.querySelector('.st-theater-container');
    if (!theaterContainer) {
      theaterContainer = document.createElement('div');
      theaterContainer.className = 'st-theater-container';
      msgElement.appendChild(theaterContainer);
    }

    // 渲染小剧场内容
    const contentDiv = document.createElement('div');
    contentDiv.className = 'st-theater-content';
    contentDiv.innerHTML = sanitizeHTML(theaterData.content);

    const headerDiv = document.createElement('div');
    headerDiv.className = 'st-theater-header';
    headerDiv.innerHTML = `
      <div class="st-theater-title">🎭 小剧场</div>
      <div class="st-theater-actions">
        <button class="st-button small" data-action="regenerate" data-msg-idx="${msgIndex}">🔄 重新生成</button>
        <button class="st-button small" data-action="edit" data-msg-idx="${msgIndex}">✏️ 编辑</button>
        <button class="st-button small" data-action="copy" data-msg-idx="${msgIndex}">📋 复制</button>
        <button class="st-button small danger" data-action="delete" data-msg-idx="${msgIndex}">🗑️ 删除</button>
      </div>
    `;

    theaterContainer.innerHTML = '';
    theaterContainer.appendChild(headerDiv);
    theaterContainer.appendChild(contentDiv);

    // 绑定按钮事件
    attachTheaterActions(theaterContainer, msgIndex);
  } catch (e) {
    console.warn('[ST] 渲染小剧场失败:', e);
  }
}

// ============ 小剧场操作事件 ============
function attachTheaterActions(container, msgIndex) {
  const regenerateBtn = container.querySelector('[data-action="regenerate"]');
  const editBtn = container.querySelector('[data-action="edit"]');
  const copyBtn = container.querySelector('[data-action="copy"]');
  const deleteBtn = container.querySelector('[data-action="delete"]');

  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => regenerateTheater(msgIndex));
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => editTheater(msgIndex));
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyTheaterContent(msgIndex));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteTheater(msgIndex));
  }
}

// ============ 重新生成小剧场 ============
async function regenerateTheater(msgIndex) {
  try {
    if (isGenerating) return;
    await generateTheater(msgIndex);
  } catch (e) {
    console.warn('[ST] 重新生成失败:', e);
  }
}

// ============ 编辑小剧场 ============
function editTheater(msgIndex) {
  try {
    const theaterData = ctx.chat[msgIndex]?.extra?.[PLUGIN_ID]?.theater;
    if (!theaterData) return;

    showDialog('编辑小剧场', theaterData.content, (newContent) => {
      theaterData.content = newContent;
      saveTheaterToChat(msgIndex, theaterData);
      renderTheaterWindow(msgIndex);
    });
  } catch (e) {
    console.warn('[ST] 编辑失败:', e);
  }
}

// ============ 复制小剧场内容 ============
function copyTheaterContent(msgIndex) {
  try {
    const theaterData = ctx.chat[msgIndex]?.extra?.[PLUGIN_ID]?.theater;
    if (!theaterData) return;

    const text = theaterData.content
      .replace(/<[^>]*>/g, '') // 移除 HTML 标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    if (typeof navigator.clipboard?.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
      });
    } else {
      console.warn('[ST] 剪贴板 API 不可用');
    }
  } catch (e) {
    console.warn('[ST] 复制失败:', e);
  }
}

// ============ 删除小剧场 ============
function deleteTheater(msgIndex) {
  try {
    const msg = ctx.chat[msgIndex];
    if (!msg || !msg.extra?.[PLUGIN_ID]?.theater) return;

    delete msg.extra[PLUGIN_ID].theater;
    saveTheaterToChat(msgIndex, null);

    const container = document.querySelector(
      `[data-message-index="${msgIndex}"] .st-theater-container`
    );
    if (container) {
      container.remove();
    }

    showToast('小剧场已删除');
  } catch (e) {
    console.warn('[ST] 删除失败:', e);
  }
}

// ============ 渲染面板内容 ============
function renderPanelContent(tab) {
  const content = document.getElementById('st-panel-content');
  if (!content) return;

  content.innerHTML = '';

  switch (tab) {
    case 'settings':
      renderSettingsTab(content);
      break;
    case 'prompts':
      renderPromptsTab(content);
      break;
    case 'api':
      renderAPITab(content);
      break;
    case 'history':
      renderHistoryTab(content);
      break;
  }
}

// ============ 设置选项卡 ============
function renderSettingsTab(container) {
  const chatId = ctx?.chatId || ctx?.chat_id;

  container.innerHTML = `
    <div class="st-setting">
      <label class="st-setting-label">
        <div class="st-toggle">
          <input type="checkbox" id="st-global-enable" class="st-toggle-switch"
            ${pluginSettings.enabled ? 'checked' : ''}>
          <span>全局启用</span>
        </div>
      </label>
      <p class="st-setting-desc">启用或禁用小剧场插件</p>
    </div>

    ${chatId
      ? `
    <div class="st-setting">
      <label class="st-setting-label">
        <div class="st-toggle">
          <input type="checkbox" id="st-chat-enable" class="st-toggle-switch"
            ${!isChatDisabled() ? 'checked' : ''}>
          <span>当前聊天启用</span>
        </div>
      </label>
      <p class="st-setting-desc">为当前聊天单独关闭小剧场</p>
    </div>
    `
      : ''
    }

    <div class="st-setting">
      <label class="st-setting-label">
        <div class="st-toggle">
          <input type="checkbox" id="st-auto-gen" class="st-toggle-switch"
            ${pluginSettings.autoGenerate ? 'checked' : ''}>
          <span>自动生成</span>
        </div>
      </label>
      <p class="st-setting-desc">AI 回复完成后自动生成小剧场（默认关闭以节省 API 调用）</p>
    </div>

    <div class="st-setting">
      <label class="st-setting-label">
        <div class="st-toggle">
          <input type="checkbox" id="st-send-worldbook" class="st-toggle-switch"
            ${pluginSettings.sendWorldBook ? 'checked' : ''}>
          <span>发送世界书</span>
        </div>
      </label>
      <p class="st-setting-desc">将启用的世界书条目发送给 AI</p>
    </div>

    <div class="st-setting">
      <label class="st-setting-label">
        <div class="st-toggle">
          <input type="checkbox" id="st-send-charcard" class="st-toggle-switch"
            ${pluginSettings.sendCharacterCard ? 'checked' : ''}>
          <span>发送角色卡</span>
        </div>
      </label>
      <p class="st-setting-desc">将角色设定发送给 AI</p>
    </div>

    <div class="st-setting">
      <label class="st-setting-label">上下文深度</label>
      <p class="st-setting-desc">发送最近多少条消息给 AI（0 = 仅当前 AI 回复）</p>
      <input type="number" id="st-context-depth" class="st-input"
        value="${pluginSettings.contextDepth}" min="0" max="50">
    </div>

    <div class="st-setting">
      <button class="st-button primary" id="st-manual-gen">
        🎬 手动生成当前消息
      </button>
    </div>
  `;

  // 绑定事件
  document.getElementById('st-global-enable')?.addEventListener('change', (e) => {
    pluginSettings.enabled = e.target.checked;
    saveSettings();
  });

  if (chatId) {
    document.getElementById('st-chat-enable')?.addEventListener('change', (e) => {
      const disabledChats = JSON.parse(
        localStorage.getItem(`${PLUGIN_ID}:disabled_chats`) || '[]'
      );
      if (!e.target.checked) {
        if (!disabledChats.includes(chatId)) disabledChats.push(chatId);
      } else {
        const idx = disabledChats.indexOf(chatId);
        if (idx > -1) disabledChats.splice(idx, 1);
      }
      localStorage.setItem(`${PLUGIN_ID}:disabled_chats`, JSON.stringify(disabledChats));
    });
  }

  document.getElementById('st-auto-gen')?.addEventListener('change', (e) => {
    pluginSettings.autoGenerate = e.target.checked;
    saveSettings();
  });

  document.getElementById('st-send-worldbook')?.addEventListener('change', (e) => {
    pluginSettings.sendWorldBook = e.target.checked;
    saveSettings();
  });

  document.getElementById('st-send-charcard')?.addEventListener('change', (e) => {
    pluginSettings.sendCharacterCard = e.target.checked;
    saveSettings();
  });

  document.getElementById('st-context-depth')?.addEventListener('change', (e) => {
    pluginSettings.contextDepth = parseInt(e.target.value) || 10;
    saveSettings();
  });

  document.getElementById('st-manual-gen')?.addEventListener('click', async () => {
    const msgIdx = findLastAIMessage();
    if (msgIdx !== null) {
      await generateTheater(msgIdx);
      showToast('小剧场已生成');
    } else {
      showToast('未找到 AI 消息');
    }
  });
}

// ============ 提示词库选项卡 ============
function renderPromptsTab(container) {
  const prompts = pluginSettings.promptLibrary;

  let html = `
    <div class="st-setting">
      <button class="st-button primary" id="st-add-prompt">+ 新增提示词</button>
      <button class="st-button" id="st-export-prompts">📤 导出</button>
      <button class="st-button" id="st-import-prompts">📥 导入</button>
    </div>
    <div style="margin-bottom: 12px;">
  `;

  prompts.forEach((prompt) => {
    html += `
      <div class="st-list-item">
        <div class="st-list-item-content">
          <div class="st-list-item-name">${escapeHTML(prompt.name)}</div>
          <div class="st-list-item-desc">
            ${prompt.category ? `📁 ${prompt.category} · ` : ''}${prompt.content.substring(0, 40)}...
          </div>
        </div>
        <div class="st-list-item-actions">
          <button class="st-button small" data-action="toggle-prompt" data-id="${prompt.id}">
            ${prompt.enabled ? '✓' : '✗'}
          </button>
          <button class="st-button small" data-action="edit-prompt" data-id="${prompt.id}">
            ✏️
          </button>
          <button class="st-button small danger" data-action="delete-prompt" data-id="${prompt.id}">
            🗑️
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  // 绑定事件
  document.getElementById('st-add-prompt')?.addEventListener('click', () => {
    showAddPromptDialog();
  });

  document.getElementById('st-export-prompts')?.addEventListener('click', () => {
    exportPrompts();
  });

  document.getElementById('st-import-prompts')?.addEventListener('click', () => {
    importPrompts();
  });

  document.querySelectorAll('[data-action="toggle-prompt"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const prompt = prompts.find((p) => p.id === id);
      if (prompt) {
        prompt.enabled = !prompt.enabled;
        saveSettings();
        renderPromptsTab(container);
      }
    });
  });

  document.querySelectorAll('[data-action="edit-prompt"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const prompt = prompts.find((p) => p.id === id);
      if (prompt) {
        showEditPromptDialog(prompt);
      }
    });
  });

  document.querySelectorAll('[data-action="delete-prompt"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const idx = prompts.findIndex((p) => p.id === id);
      if (idx > -1) {
        prompts.splice(idx, 1);
        saveSettings();
        renderPromptsTab(container);
      }
    });
  });
}

// ============ API 配置选项卡 ============
function renderAPITab(container) {
  const profiles = pluginSettings.apiProfiles;
  const currentId = pluginSettings.currentProfileId;

  let html = `
    <div class="st-setting">
      <button class="st-button primary" id="st-add-profile">+ 新增配置</button>
    </div>
  `;

  profiles.forEach((profile) => {
    const isActive = profile.id === currentId;
    html += `
      <div class="st-list-item" style="padding: 12px;">
        <div class="st-list-item-content">
          <div class="st-list-item-name">${escapeHTML(profile.name)}</div>
          <div class="st-setting-desc">${escapeHTML(profile.baseUrl)}</div>
          <div class="st-setting-desc">Model: ${escapeHTML(profile.model)}</div>
        </div>
        <div class="st-list-item-actions">
          <button class="st-button small ${isActive ? 'primary' : ''}" data-action="select-profile" data-id="${profile.id}">
            ${isActive ? '✓ 使用中' : '选择'}
          </button>
          <button class="st-button small" data-action="edit-profile" data-id="${profile.id}">
            ✏️
          </button>
          <button class="st-button small danger" data-action="delete-profile" data-id="${profile.id}">
            🗑️
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  document.getElementById('st-add-profile')?.addEventListener('click', () => {
    showAddProfileDialog();
  });

  document.querySelectorAll('[data-action="select-profile"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pluginSettings.currentProfileId = btn.dataset.id;
      saveSettings();
      renderAPITab(container);
    });
  });

  document.querySelectorAll('[data-action="edit-profile"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const profile = profiles.find((p) => p.id === id);
      if (profile) {
        showEditProfileDialog(profile);
      }
    });
  });

  document.querySelectorAll('[data-action="delete-profile"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx > -1) {
        profiles.splice(idx, 1);
        if (pluginSettings.currentProfileId === id && profiles.length > 0) {
          pluginSettings.currentProfileId = profiles[0].id;
        }
        saveSettings();
        renderAPITab(container);
      }
    });
  });
}

// ============ 历史记录选项卡 ============
function renderHistoryTab(container) {
  if (!ctx || !ctx.chat) {
    container.innerHTML = '<p class="st-empty">当前聊天无消息</p>';
    return;
  }

  let html = '<div>';
  let count = 0;

  for (let i = ctx.chat.length - 1; i >= 0 && count < 20; i--) {
    const msg = ctx.chat[i];
    const theaterData = msg.extra?.[PLUGIN_ID]?.theater;

    if (theaterData) {
      const preview = theaterData.content
        .replace(/<[^>]*>/g, '')
        .substring(0, 60);
      const time = new Date(theaterData.timestamp).toLocaleTimeString();

      html += `
        <div class="st-list-item">
          <div class="st-list-item-content">
            <div class="st-list-item-desc">${time}</div>
            <div class="st-list-item-desc">${preview}...</div>
          </div>
          <div class="st-list-item-actions">
            <button class="st-button small" data-action="view-history" data-idx="${i}">
              👁️
            </button>
          </div>
        </div>
      `;
      count++;
    }
  }

  if (count === 0) {
    html = '<p class="st-empty">暂无小剧场记录</p>';
  }

  html += '</div>';
  container.innerHTML = html;

  document.querySelectorAll('[data-action="view-history"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const theaterData = ctx.chat[idx]?.extra?.[PLUGIN_ID]?.theater;
      if (theaterData) {
        showDialog('小剧场详情', theaterData.content);
      }
    });
  });
}

// ============ 对话框 ============
function showDialog(title, content, onSave) {
  const dialog = document.getElementById('st-dialog');
  const inner = document.getElementById('st-dialog-inner');

  inner.innerHTML = `
    <div class="st-dialog-header">${escapeHTML(title)}</div>
    <textarea class="st-dialog-textarea" id="st-dialog-textarea">${escapeHTML(content)}</textarea>
    <div class="st-dialog-actions">
      <button class="st-button" id="st-dialog-cancel">取消</button>
      ${onSave ? '<button class="st-button primary" id="st-dialog-save">保存</button>' : ''}
    </div>
  `;

  dialog.classList.add('show');

  document.getElementById('st-dialog-cancel')?.addEventListener('click', () => {
    dialog.classList.remove('show');
  });

  if (onSave) {
    document.getElementById('st-dialog-save')?.addEventListener('click', () => {
      const newContent = document.getElementById('st-dialog-textarea').value;
      onSave(newContent);
      dialog.classList.remove('show');
    });
  }
}

function showAddPromptDialog() {
  const dialog = document.getElementById('st-dialog');
  const inner = document.getElementById('st-dialog-inner');

  inner.innerHTML = `
    <div class="st-dialog-header">新增提示词</div>
    <input type="text" id="st-prompt-name" class="st-input" placeholder="提示词名称" style="margin-bottom: 8px;">
    <input type="text" id="st-prompt-category" class="st-input" placeholder="分类（可选）" style="margin-bottom: 8px;">
    <textarea class="st-dialog-textarea" id="st-prompt-content" placeholder="提示词内容"></textarea>
    <div class="st-dialog-actions">
      <button class="st-button" id="st-dialog-cancel">取消</button>
      <button class="st-button primary" id="st-dialog-save">添加</button>
    </div>
  `;

  dialog.classList.add('show');

  document.getElementById('st-dialog-cancel')?.addEventListener('click', () => {
    dialog.classList.remove('show');
  });

  document.getElementById('st-dialog-save')?.addEventListener('click', () => {
    const name = document.getElementById('st-prompt-name').value.trim();
    const content = document.getElementById('st-prompt-content').value.trim();
    const category = document.getElementById('st-prompt-category').value.trim();

    if (!name || !content) {
      showToast('请填写完整信息');
      return;
    }

    pluginSettings.promptLibrary.push({
      id: `prompt_${Date.now()}`,
      name,
      content,
      category,
      enabled: true,
    });

    saveSettings();
    dialog.classList.remove('show');
    renderPanelContent('prompts');
  });
}

function showEditPromptDialog(prompt) {
  const dialog = document.getElementById('st-dialog');
  const inner = document.getElementById('st-dialog-inner');

  inner.innerHTML = `
    <div class="st-dialog-header">编辑提示词</div>
    <input type="text" id="st-prompt-name" class="st-input" value="${escapeHTML(prompt.name)}" style="margin-bottom: 8px;">
    <input type="text" id="st-prompt-category" class="st-input" value="${escapeHTML(prompt.category || '')}" placeholder="分类（可选）" style="margin-bottom: 8px;">
    <textarea class="st-dialog-textarea" id="st-prompt-content">${escapeHTML(prompt.content)}</textarea>
    <div class="st-dialog-actions">
      <button class="st-button" id="st-dialog-cancel">取消</button>
      <button class="st-button primary" id="st-dialog-save">保存</button>
    </div>
  `;

  dialog.classList.add('show');

  document.getElementById('st-dialog-cancel')?.addEventListener('click', () => {
    dialog.classList.remove('show');
  });

  document.getElementById('st-dialog-save')?.addEventListener('click', () => {
    prompt.name = document.getElementById('st-prompt-name').value.trim();
    prompt.content = document.getElementById('st-prompt-content').value.trim();
    prompt.category = document.getElementById('st-prompt-category').value.trim();

    if (!prompt.name || !prompt.content) {
      showToast('请填写完整信息');
      return;
    }

    saveSettings();
    dialog.classList.remove('show');
    renderPanelContent('prompts');
  });
}

function showAddProfileDialog() {
  const dialog = document.getElementById('st-dialog');
  const inner = document.getElementById('st-dialog-inner');

  inner.innerHTML = `
    <div class="st-dialog-header">新增 API 配置</div>
    <input type="text" id="st-profile-name" class="st-input" placeholder="配置名称" style="margin-bottom: 8px;">
    <input type="text" id="st-profile-url" class="st-input" placeholder="API 地址（如 https://api.openai.com/v1）" style="margin-bottom: 8px;">
    <input type="password" id="st-profile-key" class="st-input" placeholder="API Key" style="margin-bottom: 8px;">
    <input type="text" id="st-profile-model" class="st-input" placeholder="模型名称" style="margin-bottom: 8px;">
    <input type="number" id="st-profile-temp" class="st-input" placeholder="温度（0-2）" value="0.9" min="0" max="2" step="0.1" style="margin-bottom: 8px;">
    <input type="number" id="st-profile-tokens" class="st-input" placeholder="最大输出长度" value="800" min="1" style="margin-bottom: 8px;">
    <div class="st-dialog-actions">
      <button class="st-button" id="st-dialog-cancel">取消</button>
      <button class="st-button primary" id="st-dialog-save">添加</button>
    </div>
  `;

  dialog.classList.add('show');

  document.getElementById('st-dialog-cancel')?.addEventListener('click', () => {
    dialog.classList.remove('show');
  });

  document.getElementById('st-dialog-save')?.addEventListener('click', () => {
    const name = document.getElementById('st-profile-name').value.trim();
    const url = document.getElementById('st-profile-url').value.trim();
    const key = document.getElementById('st-profile-key').value.trim();
    const model = document.getElementById('st-profile-model').value.trim();
    const temp = parseFloat(document.getElementById('st-profile-temp').value) || 0.9;
    const tokens = parseInt(document.getElementById('st-profile-tokens').value) || 800;

    if (!name || !url || !key || !model) {
      showToast('请填写完整信息');
      return;
    }

    pluginSettings.apiProfiles.push({
      id: `profile_${Date.now()}`,
      name,
      baseUrl: url,
      apiKey: key,
      model,
      temperature: temp,
      maxTokens: tokens,
    });

    saveSettings();
    dialog.classList.remove('show');
    renderPanelContent('api');
  });
}

function showEditProfileDialog(profile) {
  const dialog = document.getElementById('st-dialog');
  const inner = document.getElementById('st-dialog-inner');

  inner.innerHTML = `
    <div class="st-dialog-header">编辑 API 配置</div>
    <input type="text" id="st-profile-name" class="st-input" value="${escapeHTML(profile.name)}" style="margin-bottom: 8px;">
    <input type="text" id="st-profile-url" class="st-input" value="${escapeHTML(profile.baseUrl)}" style="margin-bottom: 8px;">
    <input type="password" id="st-profile-key" class="st-input" placeholder="API Key（留空不修改）" style="margin-bottom: 8px;">
    <input type="text" id="st-profile-model" class="st-input" value="${escapeHTML(profile.model)}" style="margin-bottom: 8px;">
    <input type="number" id="st-profile-temp" class="st-input" value="${profile.temperature}" min="0" max="2" step="0.1" style="margin-bottom: 8px;">
    <input type="number" id="st-profile-tokens" class="st-input" value="${profile.maxTokens}" min="1" style="margin-bottom: 8px;">
    <div class="st-dialog-actions">
      <button class="st-button" id="st-dialog-cancel">取消</button>
      <button class="st-button primary" id="st-dialog-save">保存</button>
    </div>
  `;

  dialog.classList.add('show');

  document.getElementById('st-dialog-cancel')?.addEventListener('click', () => {
    dialog.classList.remove('show');
  });

  document.getElementById('st-dialog-save')?.addEventListener('click', () => {
    profile.name = document.getElementById('st-profile-name').value.trim();
    profile.baseUrl = document.getElementById('st-profile-url').value.trim();
    const newKey = document.getElementById('st-profile-key').value.trim();
    if (newKey) profile.apiKey = newKey;
    profile.model = document.getElementById('st-profile-model').value.trim();
    profile.temperature = parseFloat(document.getElementById('st-profile-temp').value) || 0.9;
    profile.maxTokens = parseInt(document.getElementById('st-profile-tokens').value) || 800;

    if (!profile.name || !profile.baseUrl || !profile.model) {
      showToast('请填写完整信息');
      return;
    }

    saveSettings();
    dialog.classList.remove('show');
    renderPanelContent('api');
  });
}

// ============ 导出/导入提示词 ============
function exportPrompts() {
  const json = JSON.stringify(pluginSettings.promptLibrary, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stage-theater-prompts-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('导出成功');
}

function importPrompts() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          pluginSettings.promptLibrary = imported;
          saveSettings();
          renderPanelContent('prompts');
          showToast('导入成功');
        }
      } catch (err) {
        showToast('导入失败：无效的 JSON 格式');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ============ 加载聊天的小剧场 ============
function loadChatTheaters() {
  try {
    if (!ctx || !ctx.chat) return;

    ctx.chat.forEach((msg, idx) => {
      const theaterData = msg.extra?.[PLUGIN_ID]?.theater;
      if (theaterData) {
        theatersMap.set(idx, theaterData);
        if (pluginSettings.showHistoryOnLoad) {
          setTimeout(() => renderTheaterWindow(idx), 100);
        }
      }
    });
  } catch (e) {
    console.warn('[ST] 加载小剧场失败:', e);
  }
}

// ============ 工具函数 ============
function saveSettings() {
  localStorage.setItem(`${PLUGIN_ID}:settings`, JSON.stringify(pluginSettings));
  if (extension_settings) {
    extension_settings[PLUGIN_ID] = pluginSettings;
    if (typeof saveSettingsDebounced === 'function') {
      saveSettingsDebounced();
    } else if (typeof window.saveSettings === 'function') {
      window.saveSettings();
    }
  }
}

function escapeHTML(str) {
  if (!str) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

function sanitizeHTML(html) {
  // 允许基本的 HTML 标签，但移除脚本
  const div = document.createElement('div');
  div.textContent = html;
  const sanitized = div.innerHTML;

  // 允许重新加入安全的 HTML 结构
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
}

function showToast(message) {
  console.log('[ST]', message);
  if (typeof echo === 'function') {
    echo({ title: 'Stage Theater', message });
  }
}

// ============ 初始化流程 ============
let initDone = false;

function fireInit() {
  if (initDone) return;
  initDone = true;
  try {
    initPlugin();
  } catch (e) {
    console.warn('[Stage Theater] 初始化异常:', e);
  }
}

// 事件方式
if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
  const ctx = SillyTavern.getContext?.();
  if (ctx?.eventSource && ctx?.event_types?.APP_READY) {
    ctx.eventSource.on(ctx.event_types.APP_READY, fireInit);
  }
}

// 轮询兜底
const t0 = Date.now();
const iv = setInterval(() => {
  const ok = !!(window.extension_settings || window.SillyTavern);
  if (ok || Date.now() - t0 > 3500) {
    clearInterval(iv);
    fireInit();
  }
}, 250);

console.log(`[Stage Theater] v${PLUGIN_VERSION} 已加载`);
