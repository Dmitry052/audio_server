import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { QueueService } from '../queue/queue.service';
import { AudioClientsService } from './audio-clients.service';
import { extractErrorDetails } from '../common/utils/errors.util';

interface WsSession {
  clientId: string;
  pcmChunks: Buffer[];
  pcmBytes: number;
  draining: boolean;
}

@Injectable()
@WebSocketGateway()
export class AudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly sessions = new WeakMap<WebSocket, WsSession>();
  private readonly minPcmBytes: number;

  constructor(
    private readonly queue: QueueService,
    private readonly clients: AudioClientsService,
    config: ConfigService,
  ) {
    const sampleRate = config.get<number>('audio.sampleRate')!;
    const channels = config.get<number>('audio.channels')!;
    const bitsPerSample = config.get<number>('audio.bitsPerSample')!;
    const minAudioSeconds = config.get<number>('audio.minAudioSeconds')!;
    this.minPcmBytes = sampleRate * channels * (bitsPerSample / 8) * minAudioSeconds;
  }

  handleConnection(client: WebSocket): void {
    console.log('Client connected');
    const session: WsSession = {
      clientId: crypto.randomUUID(),
      pcmChunks: [],
      pcmBytes: 0,
      draining: false,
    };
    this.sessions.set(client, session);

    client.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      this.onMessage(client, session, data, isBinary);
    });

    client.on('error', (error: Error) => {
      console.error('ws error:', extractErrorDetails(error));
    });
  }

  handleDisconnect(client: WebSocket): void {
    console.log('Client disconnected');
    const session = this.sessions.get(client);
    if (session) {
      this.clients.unregister(session.clientId);
      if (session.pcmBytes > 0) {
        void this.flushBufferedAudio(client, session, 'close');
      }
    }
  }

  private onMessage(
    client: WebSocket,
    session: WsSession,
    data: WebSocket.RawData,
    isBinary: boolean,
  ): void {
    if (!isBinary) {
      const message = (data as Buffer).toString();
      if (message !== 'pong') {
        console.log(`Ignoring non-binary WS message: ${message}`);
      }
      return;
    }

    const audioBuffer = Buffer.from(data as Buffer);
    session.pcmChunks.push(audioBuffer);
    session.pcmBytes += audioBuffer.length;

    if (session.pcmChunks.length === 1) {
      console.log(`First PCM chunk received: ${audioBuffer.length} bytes`);
    }

    if (session.pcmBytes >= this.minPcmBytes) {
      void this.flushBufferedAudio(client, session, 'threshold');
    }
  }

  private async flushBufferedAudio(
    client: WebSocket,
    session: WsSession,
    reason: string,
  ): Promise<void> {
    if (session.draining || session.pcmBytes === 0) return;

    // Hold the lock only while draining the buffer — queuing is instant
    session.draining = true;
    const pcmBuffer = Buffer.concat(session.pcmChunks, session.pcmBytes);
    session.pcmChunks = [];
    session.pcmBytes = 0;
    session.draining = false;

    // Register client so the worker can push the result back
    this.clients.register(session.clientId, client);

    try {
      const jobId = await this.queue.enqueue({
        type: 'pcm',
        buffer: pcmBuffer.toString('base64'),
        clientId: session.clientId,
        reason,
      });

      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ jobId, status: 'queued' }));
      }

      console.log(`Queued PCM job ${jobId} (reason=${reason}, bytes=${pcmBuffer.length})`);
    } catch (error) {
      console.error('enqueue error:', extractErrorDetails(error));
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ error: 'failed to queue job' }));
      }
    }
  }
}
