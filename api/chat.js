// api/chat.js (Vercel Serverless Function)
export default async function handler(req, res) {
    // CORS allow karne ke liye
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST allowed' });
    }

    const { messages, model, provider } = req.body;

    try {
        let apiUrl = '';
        let headers = { 'Content-Type': 'application/json' };
        let body = {};

        // Provider check kar ke uski API key uthana (Environment Variables se)
        if (provider === 'gemini') {
            const geminiKey = process.env.GEMINI_API_KEY; // Yeh Vercel mein hide hogi
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
            
            // Format for Gemini
            body = {
                contents: messages.map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }))
            };
        } 
        else if (provider === 'openai' || provider === 'deepseek') {
            const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
            apiUrl = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            body = { model: model, messages: messages };
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
