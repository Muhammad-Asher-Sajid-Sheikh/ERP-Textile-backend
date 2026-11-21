import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import type { User } from "../generated/client.js";
type TokenUser = Pick<User, "id" | "email" | "role" | "status">;
export const generateAccessToken = (user: TokenUser) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    env.accessSecret,
    {
      expiresIn: "15m",
    },
  );
};
export const generateRefreshToken = (user: TokenUser) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    env.refreshSecret,
    {
      expiresIn: "7d",
      jwtid: randomUUID(),
    },
  );
};
export const storeRefreshToken = (
  token: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) => {
  return prisma.refreshToken.create({
    data: {
      token,
      userId,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
};
export async function refreshAccessToken(
  cookie: string,
  access?: string,
  ipAddress?: string,
) {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(cookie, env.refreshSecret, {
      algorithms: ["HS256"],
    });
  } catch {
    throw new ApiError(
      401,
      "Refresh token invalid or expired",
      "INVALID_REFRESH_TOKEN",
    );
  }
  if (typeof decoded === "string" || typeof decoded.id !== "string") {
    throw new ApiError(
      401,
      "Refresh token invalid or expired",
      "INVALID_REFRESH_TOKEN",
    );
  }
  const stored = await prisma.refreshToken.findUnique({
    where: {
      token: cookie,
    },
    include: {
      user: true,
    },
  });
  if (
    !stored ||
    stored.userId !== decoded.id ||
    stored.expiresAt <= new Date()
  ) {
    throw new ApiError(
      401,
      "Refresh token invalid or expired",
      "INVALID_REFRESH_TOKEN",
    );
  }
  if (stored.user.status !== "APPROVED") {
    throw new ApiError(
      401,
      `User account is ${stored.user.status}`,
      "ACCOUNT_NOT_APPROVED",
    );
  }
  // Preserve the existing no-rotation behavior for a still-current access token,
  // but only AFTER verifying the refresh session and current account authority.
  if (access) {
    try {
      const claims = jwt.verify(access, env.accessSecret, {
        algorithms: ["HS256"],
      });
      if (
        typeof claims !== "string" &&
        claims.id === stored.userId &&
        claims.role === stored.user.role &&
        claims.status === stored.user.status
      ) {
        return {
          accessToken: access,
          refreshToken: cookie,
        };
      }
    } catch {
      /* Expired/invalid access tokens may be replaced by a valid refresh session. */
    }
  }
  const accessToken = generateAccessToken(stored.user);
  const refreshToken = generateRefreshToken(stored.user);
  await prisma.$transaction(async (tx) => {
    const removed = await tx.refreshToken.deleteMany({
      where: {
        id: stored.id,
      },
    });
    if (!removed.count) {
      throw new ApiError(
        401,
        "Refresh token already used",
        "INVALID_REFRESH_TOKEN",
      );
    }
    await tx.refreshToken.create({
      data: {
        token: refreshToken,
        userId: stored.userId,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  });
  return {
    accessToken,
    refreshToken,
  };
}
export const revokeRefreshToken = (token: string, userId: string) => {
  return prisma.refreshToken.deleteMany({
    where: {
      token,
      userId,
    },
  });
};
export const cleanupExpiredTokens = () => {
  return prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
};
