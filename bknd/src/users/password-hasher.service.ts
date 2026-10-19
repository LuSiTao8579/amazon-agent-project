import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * 密码哈希：Argon2id（OWASP 推荐）。
 * 参数采用 OWASP 给出的 Argon2id 配置（19 MiB 内存 / 2 次迭代 / 1 并行）；
 * 盐值由库自动随机生成，并与参数一起写入哈希串，无需单独存储。
 * 这里不截断、不 trim、不修改密码，原样参与哈希。
 */
@Injectable()
export class PasswordHasher {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  /** 哈希格式异常时返回 false，而不是抛错，避免登录流程因脏数据报 500。 */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
