import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = app.listen(3000);
const wss = new WebSocketServer({ server });

console.log('WebSocket server running on port 3000');
