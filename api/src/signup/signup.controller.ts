import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  startEmailSchema,
  verifyEmailSchema,
  type StartEmailInput,
  type VerifyEmailInput,
} from './dto/signup.dto.js';
import { SignupService } from './signup.service.js';

/** Public — these run before there is a session. Throttled under `/auth` in `rate-limit.ts`. */
@ApiTags('auth')
@Controller('auth/email')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  /** Emails a 6-digit code. Same answer whether or not the address has an account. Also the "resend". */
  @Post('start')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(startEmailSchema))
  start(@Body() body: StartEmailInput) {
    return this.signup.start(body.email);
  }

  /** Checks the code; signs in, creating the account first if there is none. */
  @Post('verify')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(verifyEmailSchema))
  verify(@Body() body: VerifyEmailInput) {
    return this.signup.verify(body.email, body.code);
  }
}
