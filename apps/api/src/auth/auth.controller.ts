import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { loginInputSchema, sessionSchema, type Session } from '@higheval/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { clientKey, sessionCookie, sessionToken } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  private readonly limiter = new LoginRateLimiter();

  constructor(private readonly auth: AuthService) {}

  @Get('session')
  @ApiDoc({
    summary: 'Whether sign-in is required, and whether this browser is signed in',
    response: sessionSchema,
  })
  session(@Req() request: Request): Session {
    const username = this.auth.verifyToken(sessionToken(request));
    return { authRequired: this.auth.enabled, authenticated: username !== null, username };
  }

  @Post('login')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Sign in',
    description:
      'Sets an HttpOnly session cookie valid for 12 hours. Repeated failures from one client are refused with 429 for 15 minutes.',
    body: loginInputSchema,
  })
  login(
    @Body(new ZodValidationPipe(loginInputSchema)) input: z.output<typeof loginInputSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): void {
    const client = clientKey(request);
    const wait = this.limiter.retryAfterMs(client);
    if (wait > 0) {
      response.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
      throw new HttpException(
        { message: 'Too many failed sign-ins. Try again in a few minutes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!this.auth.verifyCredentials(input.username, input.password)) {
      this.limiter.recordFailure(client);
      throw new UnauthorizedException('Wrong username or password');
    }
    this.limiter.reset(client);
    response.setHeader('Set-Cookie', sessionCookie(request, this.auth.issueToken(input.username)));
  }

  @Post('logout')
  @HttpCode(204)
  @ApiDoc({ summary: 'Sign out' })
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    response.setHeader('Set-Cookie', sessionCookie(request, null));
  }
}
