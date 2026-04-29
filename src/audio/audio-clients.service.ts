import { Injectable } from '@nestjs/common';
import WebSocket from 'ws';

@Injectable()
export class AudioClientsService {
  private readonly map = new Map<string, WebSocket>();

  register(clientId: string, ws: WebSocket): void {
    this.map.set(clientId, ws);
  }

  unregister(clientId: string): void {
    this.map.delete(clientId);
  }

  send(clientId: string, data: unknown): void {
    const ws = this.map.get(clientId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}
