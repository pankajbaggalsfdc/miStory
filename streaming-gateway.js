import { WebSocketServer } from 'ws'; // Make sure you installed the 'ws' package
import http from 'http';

// 1. Create a basic HTTP server (or use your Express app)
const server = http.createServer();

// 2. Initialize the WebSocket Server
// On Heroku, the server should be tied to the HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');

    const heartbeat = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);

    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch {
            return;
        }        
        const mySecret = process.env.apikey;
        
        if (data.type === 'pong') return;

        if (!data.prompt) return;

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
                        { role: 'user', content: data.prompt }
                    ]
                })
            }
        );

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
          
        while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;

                    const payload = line.replace('data:', '').trim();
                    if (payload === '[DONE]') {
                        ws.send(JSON.stringify({ type: 'done' }));
                        return;
                    }

                    try {
                        const parsed = JSON.parse(payload);
                        const token = parsed.choices?.[0]?.delta?.content;
                        if (token) {
                            ws.send(JSON.stringify({
                                type: 'token',
                                value: token
                            }));
                        }
                    } catch {
                        // partial JSON – ignore
                    }
                }
            }
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'error',
                message: err.message
            }));
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeat);
        console.log('❌ Client disconnected');
    });
});
