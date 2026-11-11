import {
  Body,
  Controller,
  Header,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  EmailAlreadyRegisteredError,
  RegisterUser,
} from '../../application/register-user.js';
import { ApiException } from '../../../../shared/http/api-exception.js';
import { registerSchema } from './register.schema.js';
import type { RegisterBody } from './register.schema.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegisterUser) private readonly registerUser: RegisterUser,
  ) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  async register(@Body({ schema: registerSchema }) body: RegisterBody) {
    try {
      const user = await this.registerUser.execute(body.email, body.password);

      return {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ApiException('EMAIL_ALREADY_REGISTERED');
      }

      throw error;
    }
  }
}
