// Local-only CLI utility; no public endpoint issues tokens.
import { config } from 'dotenv';
import { JwtService } from '@nestjs/jwt';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
if (!process.env.JWT_SECRET) throw new Error('Missing JWT_SECRET');
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
console.log(await jwt.signAsync({ sub: 'local-dev-user' }, {
  algorithm: 'HS256', expiresIn: 900, issuer: 'amazon-agent-project', audience: 'local-development',
}));
