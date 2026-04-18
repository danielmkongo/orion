import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { config } from '../config/index.js';
import type { JwtPayload, AuthTokens, LoginInput, RegisterInput } from '@orion/shared';

export class AuthService {
  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) throw new Error('Email already in use');

    const slug = input.orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(6);
    const org = await Organization.create({ name: input.orgName, slug });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: 'admin',
      orgId: org._id,
    });

    return this.generateTokens(user.id, user.email, org.id, user.role);
  }

  async login(input: LoginInput): Promise<AuthTokens & { user: { id: string; name: string; email: string; role: string; orgId: string } }> {
    const user = await User.findOne({ email: input.email.toLowerCase(), isActive: true });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    const tokens = this.generateTokens(user.id, user.email, user.orgId.toString(), user.role);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 8);
    await User.updateOne({ _id: user._id }, { refreshTokenHash: refreshHash });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId.toString(),
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
    } catch {
      throw new Error('Invalid refresh token');
    }

    const user = await User.findById(payload.sub);
    if (!user?.refreshTokenHash) throw new Error('Session expired');

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new Error('Invalid refresh token');

    const tokens = this.generateTokens(user.id, user.email, user.orgId.toString(), user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 8);
    await User.updateOne({ _id: user._id }, { refreshTokenHash: refreshHash });

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: '' } });
  }

  private generateTokens(userId: string, email: string, orgId: string, role: string): AuthTokens {
    const payload: JwtPayload = { sub: userId, email, orgId, role: role as any };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });
    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as any,
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  }
}

export const authService = new AuthService();
