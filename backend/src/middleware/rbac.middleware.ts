import type { RequestHandler } from "express";
import type { Role } from "../generated/enums.js";
import { ApiError } from "../utils/ApiError.js";
import { actor } from "./auth.middleware.js";
import jwt from "jsonwebtoken";

import { PrismaClient, AuditActionType } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Decimal } from '@prisma/client/runtime/client';
import 'dotenv/config';
//import getAuditContext from '../../middleware/rbac.js';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});


export const checkApproved: RequestHandler = (req, _res, next) => {
  const user = actor(req);
  if (user.status !== "APPROVED") {
    throw new ApiError(
      403,
      "Account is not approved",
      "ACCOUNT_NOT_APPROVED",
      [],
      true,
      {
        status: user.status,
      },
    );
  }
  next();
};
export const requireRole = (...roles: Role[]): RequestHandler => {
  return (req, _res, next) => {
    const user = actor(req);
    if (!roles.includes(user.role)) {
      throw new ApiError(
        403,
        "Access denied. Insufficient permissions.",
        "PERMISSION_DENIED",
        [],
        true,
        {
          requiredRoles: roles,
          userRole: user.role,
        },
      );
    }
    next();
  };
};


// interface AuditLogPayload {
//   req: Request;
//   cookieName?: string; // Defaults to "refreshToken"
//   actionType: AuditActionType;
//   actionDetails?: string;
//   performedBy?: string;
//   ipAddress?: string;
// }

// interface RefreshTokenPayload extends jwt.JwtPayload {
//   id?: string;
//   userId?: string;
//   email?: string;
//   role?: string;
// }

// const getCookieValue = (req: Request, name: string): string | undefined => {
//   const cookies = (req as Request & { cookies?: Record<string, unknown> })
//     .cookies;
//   if (cookies && typeof cookies[name] === "string") {
//     return cookies[name];
//   }

//   const cookieHeader = req.headers.cookie;
//   if (!cookieHeader) return undefined;

//   const parts = cookieHeader.split(";").map((part) => part.trim());
//   for (const part of parts) {
//     const eqIndex = part.indexOf("=");
//     if (eqIndex === -1) continue;
//     const key = part.slice(0, eqIndex).trim();
//     if (key === name) {
//       return decodeURIComponent(part.slice(eqIndex + 1).trim());
//     }
//   }

//   return undefined;
// };

// export const createAuditLog = async ({
//   req,
//   cookieName = "refreshToken",
//   actionType,
//   actionDetails,
//   performedBy,
//   ipAddress,
// }: AuditLogPayload) => {
//   try {
//     const refreshToken = getCookieValue(req, cookieName);
//     if (!refreshToken) {
//       throw new Error(`Refresh token cookie "${cookieName}" is missing`);
//     }

//     const secret = env.refreshSecret || process.env.REFRESH_SECRET_KEY;
//     if (!secret) {
//       throw new Error("Refresh token secret is not configured");
//     }

//     const decoded = jwt.verify(refreshToken, secret) as RefreshTokenPayload;
//     const userId = decoded.id ?? decoded.userId;

//     if (!userId) {
//       throw new Error("User ID not found in refresh token");
//     }

//     const auditLog = await prisma.auditLog.create({
//       data: {
//         userId,
//         actionType,
//         actionDetails,
//         performedBy: performedBy ?? userId,
//         ipAddress: ipAddress ?? req.ip ?? "unknown",
//       },
//     });

//     return auditLog;
//   } catch (error) {
//     throw error;
//   }
// };