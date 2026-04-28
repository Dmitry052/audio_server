import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { AudioPipelineService } from './audio-pipeline.service';
import { extractErrorDetails } from '../common/utils/errors.util';

interface WsSession {
  pcmChunks: Buffer[];
  pcmBytes: number;
  isProcessing: boolean;
}

@Injectable()
@WebSocketGateway()
export class AudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly sessions = new WeakMap<WebSocket, WsSession>();
  private readonly minPcmBytes: number;

  constructor(
    private readonly pipeline: AudioPipelineService,
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
    const session: WsSession = { pcmChunks: [], pcmBytes: 0, isProcessing: false };
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
    if (session && session.pcmBytes > 0) {
      void this.flushBufferedAudio(client, session, 'close');
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
    if (session.isProcessing || session.pcmBytes === 0) return;

    session.isProcessing = true;

    const pcmBuffer = Buffer.concat(session.pcmChunks, session.pcmBytes);
    session.pcmChunks = [];
    session.pcmBytes = 0;

    try {
      const result = await this.pipeline.processPcm(pcmBuffer, reason);

      if (result && client.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(result);
        client.send(payload);
        console.log(`Sent result to client: ${payload}`);
      }
    } catch (error) {
      console.error('pipeline error:', extractErrorDetails(error));

      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ error: 'audio pipeline failed' }));
      }
    } finally {
      session.isProcessing = false;

      // Flush again if more audio arrived while processing.
      if (session.pcmBytes >= this.minPcmBytes) {
        void this.flushBufferedAudio(client, session, 'backlog');
      }
    }
  }
}
