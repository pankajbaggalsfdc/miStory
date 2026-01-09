import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { registerStreamingGateway } from './streaming-gateway.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ One WebSocket server
const wss = new WebSocketServer({ server });

// ✅ Attach streaming logic
registerStreamingGateway(wss);

// ✅ One listener only
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server listening on ${PORT}`);
});
