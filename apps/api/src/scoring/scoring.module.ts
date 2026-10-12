import { Module } from '@nestjs/common';
import { Judge } from './judge/judge.js';
import { OpenRouterJudge } from './judge/openrouter-judge.js';

@Module({
  providers: [{ provide: Judge, useClass: OpenRouterJudge }],
  exports: [Judge],
})
export class ScoringModule {}
