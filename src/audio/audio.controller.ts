import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { QueueService } from '../queue/queue.service';
import { extractErrorDetails } from '../common/utils/errors.util';

@Controller()
export class AudioController {
  constructor(private readonly queue: QueueService) {}

  @Post('summarize')
  @HttpCode(HttpStatus.ACCEPTED)
  async submitSummarize(@Req() req: Request): Promise<{ jobId: string; status: string }> {
    const wavBuffer = req.body as Buffer;
    console.log(`Received WAV for summarization: ${wavBuffer.length} bytes`);

    const jobId = await this.queue.enqueue({
      type: 'wav',
      buffer: wavBuffer.toString('base64'),
    });

    console.log(`Queued WAV job: ${jobId}`);
    return { jobId, status: 'queued' };
  }

  @Get('summarize/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      const status = await this.queue.getJobStatus(jobId);
      if (!status) throw new NotFoundException(`Job ${jobId} not found`);
      return status;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error('getJobStatus error:', extractErrorDetails(error));
      throw error;
    }
  }
}
