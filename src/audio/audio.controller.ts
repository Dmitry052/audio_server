import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AudioPipelineService } from './audio-pipeline.service';
import { extractErrorDetails } from '../common/utils/errors.util';

@Controller()
export class AudioController {
  constructor(private readonly pipeline: AudioPipelineService) {}

  @Post('summarize')
  async summarize(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const wavBuffer = req.body as Buffer;
      console.log(`Received WAV for summarization: ${wavBuffer.length} bytes`);

      const result = await this.pipeline.processWav(wavBuffer);

      if (!result) {
        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ error: 'Audio produced no usable transcript' });
        return;
      }

      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.error('summarize error:', extractErrorDetails(error));
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Summarization failed' });
    }
  }
}
