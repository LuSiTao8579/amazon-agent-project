import {
  ConflictException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { PasswordHasher } from '../users/password-hasher.service.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto, SignupDto } from './auth.dto.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: string;

  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    // Missing users also incur password verification; never persist this dummy credential.
    this.dummyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  async signup(input: SignupDto) {
    const passwordHash = await this.hasher.hash(input.password);
    try {
      const user = await this.users.create({
        email: input.email,
        passwordHash,
      });
      return { message: '注册成功，请登录', user };
    } catch (error) {
      if (error instanceof ConflictException)
        throw new ConflictException('该邮箱已注册');
      throw error;
    }
  }

  async login(input: LoginDto) {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    const valid = await this.hasher.verify(
      credentials?.passwordHash ?? this.dummyHash,
      input.password,
    );
    if (!credentials || !valid)
      throw new UnauthorizedException('邮箱或密码错误');

    const user = await this.users.findById(credentials.id);
    if (!user || user.status !== 'active') throw new UnauthorizedException('邮箱或密码错误');

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user,
    };
  }
}
