import fetch from 'node-fetch';

export function registerStreamingGateway(wss) {
    wss.on('connection', (ws) => {
        console.log('🔌 Client connected');

        //  queues
        const ttsQueue = [];
        let ttsProcessing = false;
        
        async function enqueueTTS(ws, text) {
          ttsQueue.push(text);
          if (!ttsProcessing) processTTSQueue(ws);
        }
        
        async function processTTSQueue(ws) {
          ttsProcessing = true;
        
          while (ttsQueue.length > 0) {
            const phrase = ttsQueue.shift();
            await streamAudio(ws, phrase); // 🔒 strictly sequential
          }
        
          ttsProcessing = false;
        }

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

            console.log(' data @}-- ' + data);

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
                                    enqueueTTS(ws, phrase);
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
                    "instructions": "Read this story as a natural human narrator. Use moderate emotional expression. Match pacing and tone to the story’s flow." + 
                                        "Guidelines: " +
                                        " - Calm and curious at the beginning " +
                                        " - Slightly playful during light moments " +
                                        " - Quicker and more focused during tense sections " +
                                        " - Softer and slower during emotional resolution " +
                                        " - Warm, reassuring tone at the end " +
                                        " Use natural pauses at line breaks. " +
                                        " Do not exaggerate or dramatize.  " +
                                        " Keep the delivery intimate, smooth, and human.",
                    input: text,
                    response_format: 'mp3'
                })
            }
        );

        const buffer = await res.arrayBuffer();
        const mp3Base64 = Buffer.from(buffer).toString('base64');
        console.log(' voice text for @}-------------------------------------------------------------------------------------------- ' + text);

      ws.send(JSON.stringify({
        type: 'audio',
        format: 'mp3',
        caption: text,
        data: mp3Base64
      }));

    } catch (err) {
        ws.send(JSON.stringify({
            type: 'audio_error',
            message: err.message
        }));
    }
}
