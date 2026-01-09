import fetch from 'node-fetch';

export function registerStreamingGateway(wss) {
    wss.on('connection', (ws) => {
        console.log('🔌 Client connected');

        const heartbeat = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);

        ws.on('message', async (message) => {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch {
                return;
            }

            if (data.type === 'pong') return;
            if (!data.prompt) return;

            try {
                const response = await fetch(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'gpt-4.1-mini',
                            stream: true,
                            messages: [{ role: 'user', content: data.prompt }]
                        })
                    }
                );

                let buffer = '';

                response.body.on('data', (chunk) => {
                    buffer += chunk.toString();

                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep partial line

                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;

                        const payload = line.replace('data:', '').trim();
                        console.log(' payload @}-- ' + payload);
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
                            // partial JSON, ignore
                        }
                    }
                });

                response.body.on('end', () => {
                    ws.send(JSON.stringify({ type: 'done' }));
                });

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
}
