import fetch from 'node-fetch';

export function registerStreamingGateway(wss) {
    wss.on('connection', (ws) => {
        console.log('🔌 Client connected');

        const heartbeat = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 25000);

        let textBuffer = '';

        ws.on('message', async (message) => {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch {
                return;
            }

            if (!data.prompt) return;

            try {
                /** -------------------------------
                 * 1️⃣ STREAM TEXT FROM CHAT
                 * --------------------------------*/
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

                response.body.on('data', async (chunk) => {
                    buffer += chunk.toString();
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

                                textBuffer += token;

                                /** -------------------------------
                                 * 2️⃣ CHUNK TEXT FOR TTS
                                 * -------------------------------**/
                                if (shouldFlush(textBuffer)) {
                                    const phrase = textBuffer.trim();
                                    textBuffer = '';
                                    console.log(' Phrase to Audio @}-- ' + phrase);
                                    streamAudio(ws, phrase);
                                } 
                            }
                        } catch {
                            // ignore partial JSON
                        }
                    }
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

/** --------------------------------
 * Chunking heuristic
 * --------------------------------*/
function shouldFlush(text) {
    return (
        text.split(' ').length >= `${process.env.wordCount}` ||
        /[.!?]$/.test(text)
    );
}

/** --------------------------------
 * Stream audio from OpenAI TTS
 * --------------------------------*/
async function streamAudio(ws, text) {
    try {
        const res = await fetch(
            'https://api.openai.com/v1/audio/speech',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini-tts',
                    voice: 'coral',
                    input: text,
                    response_format: 'pcm'
                })
            }
        );

        ws.send(JSON.stringify({
        type: 'audio',
        format: 'pcm16',
        sampleRate: 24000,
        data: res.body.toString('base64')
        }));
    /*
    console.log (' text @}--' + text);
    console.log (' res @}--' + res.body);

    for await (const chunk of res.body) {
      if (ws.readyState !== ws.OPEN) return;

      console.log (' Chunk sent @}--' + chunk);
      console.log (' Chunk sent @}--' + chunk.toString('base64'));

      ws.send(JSON.stringify({
        type: 'audio',
        format: 'pcm16',
        sampleRate: 24000,
        data: chunk.toString('base64')
      }));
    }*/

    } catch (err) {
        ws.send(JSON.stringify({
            type: 'audio_error',
            message: err.message
        }));
    }
}
