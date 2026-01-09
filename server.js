import express from 'express';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import './streaming-gateway.js';

dotenv.config();

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
    console.log('Server listening... ');
});

export const wss = new WebSocketServer({ server });
