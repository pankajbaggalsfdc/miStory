import { WebSocketServer } from 'ws'; // Make sure you installed the 'ws' package
import http from 'http';

// 1. Create a basic HTTP server (or use your Express app)
const server = http.createServer();

// 2. Initialize the WebSocket Server
// On Heroku, the server should be tied to the HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        const { prompt } = JSON.parse(message.toString());
        const mySecret = process.env.apikey;

        const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${mySecret}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1-mini',
                    stream: true,
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                })
            }
        );

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;

                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') {
                    ws.send(JSON.stringify({ done: true }));
                    return;
                }

                try {
                    const parsed = JSON.parse(data);
                    const token = parsed.choices?.[0]?.delta?.content;
                    if (token) {
                        ws.send(JSON.stringify({ token }));
                    }
                } catch (e) {
                    // ignore partial JSON
                }
            }
        }
    });

    ws.on('close', () => console.log('Client disconnected'));
});
