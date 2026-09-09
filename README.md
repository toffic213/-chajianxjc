# Stage Theater 🎭

Auto-generate mini theater scenes (小剧场) after AI replies using an independent API. This SillyTavern extension provides a complete setup for generating contextual dramatic scenarios based on chat messages.

## Features

✨ **Core Functions**
- 🎬 Automatically trigger mini-scene generation after each AI reply
- 🔌 Independent OpenAI-compatible API (not reliant on SillyTavern's model)
- 📚 Prompt library with unlimited templates
- 💾 Persistent prompt & API settings
- 🎯 Automatic scene results stored in chat history

**Scene Generation**
- Multiple prompt merging (combine several prompts into one generation)
- Customizable context depth (0-20 recent messages)
- Optional world book inclusion
- Character card data support
- HTML/Markdown rendering in results

**User Interface**
- 🎈 Floating ball as single control point
- ⚙️ All settings accessible from floating panel
- 📍 Scene results displayed below corresponding AI messages
- 🎨 Clean, dark/light mode responsive design
- 📋 Recent generation records

**Result Window Features**
- 🔄 Regenerate with same context
- 📋 Copy to clipboard
- ❤️ Favorite scenes for later viewing
- 📁 Collapse/expand content
- 🗑️ Delete individual scenes
- ✏️ Edit inline (WIP)

## Installation

1. Copy the `stage-theater` folder into your SillyTavern extensions directory:
   ```
   data/[username]/extensions/stage-theater/
   ```

2. Restart SillyTavern and go to **Settings → Extensions**

3. Enable "Stage Theater" in the extensions list

## Configuration

### API Setup
1. Click the floating ball (bottom-right)
2. Fill in your OpenAI-compatible API:
   - **API Address**: e.g., `https://api.openai.com` or `http://localhost:8000`
   - **API Key**: Your authentication token
   - **Model**: e.g., `gpt-4`, `gpt-3.5-turbo`
   - Click "Get Model List" to fetch available models

### Prompt Library
1. Click **"+ Add Prompt"** to create a new template
2. Enter a name and content
3. Check the checkbox to enable
4. Or **Import JSON** with format:
   ```json
   [
     {"name": "Romantic Scene", "content": "Write a romantic mini-scene..."},
     {"name": "Comedy", "content": "Write a funny mini-scene..."}
   ]
   ```

### Generation Settings
- **Enable Auto-Generate**: Toggle to turn on/off auto-triggering
- **Temperature**: 0-1, controls randomness (default 0.9)
- **Max Length**: Output tokens (default 800)
- **Context Depth**: How many recent messages to include (0-20, default 10)
- **Send World Book**: Include active world book entries (optional)

## How It Works

1. **Trigger**: After AI completes a full reply, Stage Theater automatically:
   - Fetches the latest AI message
   - Gathers selected prompts from library
   - Collects context (recent messages, world book, character data)

2. **Generation**: Sends merged prompt + context to your independent API

3. **Display**: Results appear in a panel directly below the AI message
   - Supports full HTML/Markdown rendering
   - User can regenerate, edit, copy, favorite, or delete

4. **Persistence**: 
   - Scene results saved to chat metadata
   - Settings saved to localStorage + SillyTavern extension_settings
   - Survives restart

## API Payload Example

```json
{
  "model": "gpt-4",
  "temperature": 0.9,
  "max_tokens": 800,
  "messages": [
    {
      "role": "system",
      "content": "You are a creative writer. Generate a mini theatrical scene..."
    },
    {
      "role": "user",
      "content": "[AI's reply text]"
    }
  ]
}
```

## Troubleshooting

**Scenes not generating?**
- Ensure auto-generate is enabled
- Check API configuration (address, key, model)
- Verify at least one prompt is enabled
- Check browser console for errors

**API connection fails?**
- Try with/without `/v1` in API address
- Verify API key is correct
- Test with a simpler prompt first

**Settings not saving?**
- Check if localStorage is enabled
- Verify you have proper permissions
- Try exporting settings as backup

## API Compatibility

Works with any OpenAI-compatible endpoint:
- OpenAI (GPT-4, GPT-3.5)
- Azure OpenAI
- Ollama
- LM Studio
- LocalAI
- Vllm
- Any other /chat/completions compatible API

## Data Storage

- **Settings**: `localStorage[stage-theater_settings]` + `window.extension_settings.stage-theater`
- **Scenes**: `chat.metadata.extensions.stage-theater.messages.*`
- Auto-syncs with SillyTavern on changes

## Keyboard Shortcuts

- Floating ball click: Toggle settings panel
- Scene window buttons: Self-explanatory SVG icons

## Performance Notes

- First request may take a moment (API latency)
- Scenes only generate on complete AI replies
- No background polling or constant API calls
- Lightweight DOM insertion, minimal performance impact

## Disclaimer

This extension requires an external API (OpenAI, Ollama, etc.). API costs/usage are your responsibility.

## License

MIT

## Version

**1.0.0**

---

**Author**: toffic213  
**Last Updated**: 2026-09  
**Compatible with**: SillyTavern (Tauri build)
