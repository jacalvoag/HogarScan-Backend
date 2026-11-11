import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  InvalidCredentialsError,
  LoginUser,
} from '../../application/login-user.js';
import {
  EmailAlreadyRegisteredError,
  RegisterUser,
} from '../../application/register-user.js';
import { ApiException } from '../../../../shared/http/api-exception.js';
import { registerSchema } from './register.schema.js';
import type { RegisterBody } from './register.schema.js';
import { loginSchema } from './login.schema.js';
import type { LoginBody } from './login.schema.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegisterUser) private readonly registerUser: RegisterUser,
    @Inject(LoginUser) private readonly loginUser: LoginUser,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  async login(@Body({ schema: loginSchema }) body: LoginBody) {
    try {
      const result = await this.loginUser.execute(body.email, body.password);

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          created_at: result.user.createdAt.toISOString(),
        },
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_at: result.expiresAt.toISOString(),
        summary_generation: result.summaryGeneration,
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new ApiException('INVALID_CREDENTIALS');
      }

      throw error;
    }
  }

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
