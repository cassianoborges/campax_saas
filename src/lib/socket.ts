import { io, Socket } from 'socket.io-client';
import { apiClient } from './apiClient';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(apiClient.baseUrl, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}
