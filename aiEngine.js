const AIEngine = {
    _controller: null,
    _BACKEND_URL: 'https://chatgpt-clone-six-theta.vercel.app/api/chat/',
    
    _QUIZ_JSON_INSTRUCTION: 'You must respond ONLY with a valid JSON object containing an array of questions. Format: { "quiz": [ { "q": "question text", "options": ["Option A text", "Option B text", "Option C text", "Option D text"], "answer": "correct option text exactly as it appears in options" } ] }',
    
    _THINKING_INSTRUCTION: `IMPORTANT INSTRUCTIONS:
1. You MUST think step-by-step.
2. You MUST output your internal thought process wrapped EXACTLY inside <thought> and </thought> tags.
3. If you are writing code, you MUST output a tag EXACTLY like this before the code block: <file_action status="creating" filename="index.html">
Do not skip these tags.`,

    _FILE_INSTRUCTION: `If you are writing code, output a tag EXACTLY like this before the code block: <file_action status="creating" filename="index.html">`,

    PROVIDERS: {
        openai: {
            endpoint: 'https://api.openai.com/v1/chat/completions',
            modelsEndpoint: 'https://api.openai.com/v1/models',
            authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
            defaultModel: 'gpt-4o'
        },
        openrouter: {
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            modelsEndpoint: 'https://openrouter.ai/api/v1/models',
            authHeader: (key) => ({
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': location.origin || 'http://localhost',
                'X-Title': 'ChatGPT Clone'
            }),
            defaultModel: 'openai/gpt-4o-mini'
        },
        deepseek: {
            endpoint: 'https://api.deepseek.com/v1/chat/completions',
            modelsEndpoint: 'https://api.deepseek.com/v1/models',
            authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
            defaultModel: 'deepseek-chat'
        },
        gemini: {
            endpoint: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
            modelsEndpoint: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
            defaultModel: 'gemini-2.0-flash'
        }
    },
    abort() {
        if (this._controller) { this._controller.abort(); this._controller = null; }
    },
    async webSearch(query) {
        try {
            const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
            if (!res.ok) return null;
            const data = await res.json();
            const results = [];
            if (data.AbstractText) results.push({ title: data.Heading || 'Summary', snippet: data.AbstractText });
            if (Array.isArray(data.RelatedTopics)) {
                data.RelatedTopics.slice(0, 3).forEach(t => {
                    if (t.Text) results.push({ title: t.Text.slice(0, 60), snippet: t.Text });
                });
            }
            return results.length ? results : null;
        } catch (e) {
            console.warn('Web search failed:', e);
            return null;
        }
    },
    buildSystemPrompt(settings) {
        let prompt = settings.systemPrompt || '';
        
        prompt += '\n\n' + (settings.showThinking ? this._THINKING_INSTRUCTION : this._FILE_INSTRUCTION);

        const memories = settings.memories || [];
        if (memories.length > 0) {
            prompt += '\n\n[User Information]\n' + memories.map(m => `- ${m.text}`).join('\n');
        }
        return prompt;
    },
    async generateResponse(messages, model, systemPrompt, webSearchActive, onChunk) {
        const settings = await Storage.getSettings();

        const provider = settings.provider || 'simulated';
        const apiKey = (settings.providerKeys?.[provider] || settings.apiKey || '').trim();

        console.log('[AIEngine] provider=', provider, '| hasKey=', !!apiKey, '| model=', model);

        const lastUserMsg = [...messages].reverse().find(m => m.sender === 'user')?.text || '';

        if (window.RAGEngine && lastUserMsg) {
            try {
                const ragChunks = await window.RAGEngine.search(lastUserMsg, 3);
                if (ragChunks.length > 0) {
                    systemPrompt += '\n\n[Relevant Document Context]\n' + ragChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');
                }
            } catch (e) {
                console.warn('RAG search failed:', e);
            }
        }

        if (/\b(quiz|test)\b/i.test(lastUserMsg)) {
            systemPrompt += '\n\n' + this._QUIZ_JSON_INSTRUCTION;
        }

        if (webSearchActive && settings.realWebSearch) {
            const results = await this.webSearch(lastUserMsg.slice(0, 200));
            if (results) {
                const context = results.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`).join('\n');
                systemPrompt += `\n\n[Web Search Results]\n${context}\n\nUse these results if relevant.`;
            }
        }

        if (provider !== 'simulated') {
            try {
                const call = () => this.fetchViaBackend(provider, messages, model, systemPrompt, onChunk);
                return await Utils.retryWithBackoff(call, 3, 1000);
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                console.warn(`${provider} backend failed → simulation:`, err);
                if (window.ChatRenderer) ChatRenderer.showToast(`${provider} failed — simulation`);
            }
        } else {
            console.warn('[AIEngine] Falling back to simulated mode.');
        }

        return await this.generateSimulatedResponse(messages, model, systemPrompt, webSearchActive, onChunk, settings.streamSpeed || 1.0);
    },
    async fetchViaBackend(provider, messages, model, systemPrompt, onChunk) {
        const payloadMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))
        ];
        this._controller = new AbortController();
        const response = await fetch(this._BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, model: model || this.PROVIDERS[provider]?.defaultModel, messages: payloadMessages }),
            signal: this._controller.signal
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            throw Object.assign(new Error(`Backend error ${response.status}: ${errText.slice(0, 200)}`), { status: response.status });
        }
        const data = await response.json();
        const fullText = data.choices?.[0]?.message?.content || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (onChunk && fullText) {
            onChunk(fullText, fullText);
        }
        this._controller = null;
        return fullText;
    },
    async fetchOpenAICompatible(providerKey, apiKey, messages, model, systemPrompt, onChunk) {
        return this.fetchViaBackend(providerKey, messages, model, systemPrompt, onChunk);
    },
    async fetchGemini(apiKey, messages, model, systemPrompt, onChunk) {
        return this.fetchViaBackend('gemini', messages, model, systemPrompt, onChunk);
    },
    async listModels(providerKey, apiKey) {
        const cfg = this.PROVIDERS[providerKey];
        if (!cfg) throw new Error(`Unknown: ${providerKey}`);
        if (providerKey === 'gemini') {
            return ['gemini-2.0-flash', 'gemini-1.5-pro'];
        }
        return ['gpt-4o', 'gpt-3.5-turbo', 'deepseek-chat'];
    },
    async generateSimulatedResponse(messages, model, systemPrompt, webSearchActive, onChunk, speed = 1.0) {
        const lastUserMsg = [...messages].reverse().find((m) => m.sender === 'user')?.text || '';
        const lower = lastUserMsg.toLowerCase();
        const prefix = webSearchActive
            ? `*🌐 Searched: "${Utils.escapeHtml(lastUserMsg.slice(0, 40))}..."*\n\n` : '';
        let responseMarkdown = '';

        if (/\b(quiz|test)\b/i.test(lower) && systemPrompt && systemPrompt.includes('respond ONLY with a valid JSON')) {
            const quizObj = {
                quiz: [
                    { q: "If 3x - 7 = 2x + 9, what is the value of x?", options: ["-16", "9", "16", "2"], answer: "16" },
                    { q: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], answer: "Paris" },
                    { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: "Mars" },
                    { q: "What does HTML stand for?", options: ["HyperText Markup Language", "HighText Machine Language", "HyperTool Markup Language", "Hyperlinks and Text Markup Language"], answer: "HyperText Markup Language" },
                    { q: "Which of these is NOT a JavaScript data type?", options: ["String", "Number", "Boolean", "Character"], answer: "Character" }
                ]
            };
            const quizJson = JSON.stringify(quizObj, null, 2);
            let currentQuiz = '';
            const qWords = quizJson.split(/(\s+)/);
            const baseDelay = Math.max(2, 20 / speed);
            for (const word of qWords) {
                currentQuiz += word;
                onChunk?.(word, currentQuiz);
                await new Promise((r) => setTimeout(r, Math.random() * baseDelay + baseDelay / 2));
            }
            return currentQuiz;
        }

        if (/(quiz|test|sawal|pooch|question)/i.test(lower)) {
            const quizHtml = `
Chalo! 🔥 Diagnostic Quiz shuru karte hain. Target: 100% Score! 🎯

Pehle apni current level check karo. Har question ko khud solve karna.

<div class="quiz-card" id="quiz-card-1">
    <div class="quiz-header">
        <span class="nav"><i class="fa-solid fa-chevron-left"></i></span>
        <span>1 of 10</span>
        <div class="flex gap-4">
            <span class="nav"><i class="fa-regular fa-lightbulb"></i></span>
            <span class="nav"><i class="fa-regular fa-copy"></i></span>
        </div>
    </div>
    <div class="quiz-question">
        If 3x - 7 = 2x + 9, what is the value of x?
    </div>
    <div class="quiz-options">
        <div class="quiz-opt" onclick="window.selectQuizOption(this, 'A')"><div class="circle">A</div> -16</div>
        <div class="quiz-opt" onclick="window.selectQuizOption(this, 'B')"><div class="circle">B</div> 9</div>
        <div class="quiz-opt" onclick="window.selectQuizOption(this, 'C')"><div class="circle">C</div> 16</div>
        <div class="quiz-opt" onclick="window.selectQuizOption(this, 'D')"><div class="circle">D</div> 2</div>
    </div>
    <div class="quiz-footer">
        <button class="quiz-next-btn" onclick="window.submitQuiz(this)">Next</button>
    </div>
</div>

*Tip: Sahi jawab C (16) hai. (3x - 2x = 9 + 7)*
`;
            let currentQuiz = '';
            const qWords = quizHtml.split(/(\s+)/);
            const baseDelay = Math.max(2, 20 / speed);
            for (const word of qWords) {
                currentQuiz += word;
                onChunk?.(word, currentQuiz);
                await new Promise((r) => setTimeout(r, Math.random() * baseDelay + baseDelay / 2));
            }
            return currentQuiz;
        }

        if (/\b(code|function|javascript|python|html|react|api|css|website|site|calculator)\b/.test(lower)) {
            responseMarkdown = `<thought>
User wants a working code/website. I should create an HTML file and write the structure.
Let's simulate the file creation process.
</thought>
<file_action status="creating" filename="index.html">
Here's a production-ready implementation:

\`\`\`javascript
async function processDataPipeline(items, { concurrency = 5 } = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const out = await Promise.all(batch.map(async (item) => ({
      id: item?.id ?? crypto.randomUUID(),
      status: 'completed',
      timestamp: new Date().toISOString()
    })));
    results.push(...out);
  }
  return results;
}

processDataPipeline([{ id: 101 }, { id: 102 }])
  .then(console.log)
  .catch(console.error);
\`\`\`

### Key Highlights
1. **Bounded concurrency** — protects APIs
2. **Input validation** — early failure
3. **Deterministic output**`;
        } else if (/\b(quantum|explain|what is|how to|define)\b/.test(lower)) {
            responseMarkdown = `<thought>
User is asking for an explanation. I will break it down into simple points.
</thought>
${prefix}### Explanation

**Classical bits** are 0 or 1. **Qubits** can be *superposition* of both.

| Concept | Meaning |
|---|---|
| Superposition | 0, 1, or both |
| Entanglement | Correlated qubits |
| Interference | Amplifies correct answers |

> **Analogy:** Classical = sequential pages. Quantum = all at once.`;
        } else if (/^(hi|hello|hey|salam|assalam)/.test(lower)) {
            responseMarkdown = `Hello! 👋 Ready to help.

Try:
- **Write code**
- **Explain concepts**
- **Draft text**
- **Take a Quiz** (Type: "Mera quiz lo")

What would you like?`;
        } else {
            responseMarkdown = `<thought>
User is asking a general question. I'll provide a structured response.
</thought>
${prefix}I understand you're asking about **"${Utils.escapeHtml(lastUserMsg.slice(0, 60))}"**.

Structured take:

1. **Context** — clarify your key constraint
2. **Options** — 2-3 valid approaches with tradeoffs
3. **Recommendation** — pick based on your needs

Want me to expand?`;
        }

        let currentText = '';
        const words = responseMarkdown.split(/(\s+)/);
        const baseDelay = Math.max(2, 20 / speed);
        for (const word of words) {
            currentText += word;
            onChunk?.(word, currentText);
            await new Promise((r) => setTimeout(r, Math.random() * baseDelay + baseDelay / 2));
        }
        return currentText;
    }
}