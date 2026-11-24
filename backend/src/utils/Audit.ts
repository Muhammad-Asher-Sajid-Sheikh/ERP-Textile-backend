import { type Request } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient, AuditActionType } from "../generated/client.js"; // Adjust import path to your Prisma client
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

// 1. Interfaces
interface AuditLogPayload {
  req: Request;                   // Express Request to read cookies and client IP
  actionType: AuditActionType;
  actionDetails?: string;
  performedBy?: string;           // Defaults to decoded userId if omitted
  ipAddress?: string;             // Defaults to req.ip if omitted
  cookieName?: string;            // Defaults to "refreshtoken" / "refreshToken"
  refreshToken?: string;          // Optional manual override if token is already extracted
}

interface RefreshTokenPayload extends jwt.JwtPayload {
  id?: string;
  userId?: string;
  email?: string;
  role?: string;
}

// 2. Helper to safely extract cookie from req.cookies or cookie header
const getRefreshTokenFromReq = (req: Request, preferredName?: string): string | undefined => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;

  // Check parsed cookies (via cookie-parser middleware)
  if (cookies) {
    if (preferredName && cookies[preferredName]) return cookies[preferredName];
    if (cookies["refreshtoken"]) return cookies["refreshtoken"];
    if (cookies["refreshToken"]) return cookies["refreshToken"];
  }

  // Fallback: parse raw Cookie header directly
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return undefined;

  const namesToCheck = preferredName
    ? [preferredName]
    : ["refreshtoken", "refreshToken"];

  const cookiePairs = rawCookie.split(";").map((c) => c.trim());
  for (const pair of cookiePairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (namesToCheck.includes(key)) {
      return decodeURIComponent(pair.slice(eqIdx + 1).trim());
    }
  }

  return undefined;
};

// 3. createAuditLog Implementation
export const createAuditLog = async ({
  req,
  actionType,
  actionDetails,
  performedBy,
  //ipAddress,
  //cookieName,
  //refreshToken: tokenFromArgs,
}: AuditLogPayload) => {
  try {
    // 1. Extract refresh token from cookie or argument
    // const token = tokenFromArgs || getRefreshTokenFromReq(req, cookieName);

    // if (!token) {
    //   throw new Error(
    //     `Refresh token not found in cookies. Ensure credentials/cookies are included in the request.`
    //   );
    // }

    // // 2. Get the secret key from environment variables
    // const secret =
    //   process.env.REFRESH_SECRET_KEY || process.env.JWT_REFRESH_SECRET;

    // if (!secret) {
    //   throw new Error(
    //     "REFRESH_SECRET_KEY (or JWT_REFRESH_SECRET) is not configured in environment variables"
    //   );
    // }

    // // 3. Verify and decode refresh token
    // const decoded = jwt.verify(token, secret) as RefreshTokenPayload;

    // // Tokens commonly store user id under `id` or `userId`
    const userId = performedBy;

    if (!userId) {
      throw new Error("User ID not found in token payload");
    }

    // 4. Resolve fallback metadata
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]?.split(",")[0]?.trim()
      : forwardedFor?.split(",")[0]?.trim();

    const finalIp = forwardedIp || req.ip || "unknown";

    // 5. Create audit log record
    const auditLog = await prisma.auditLog.create({
      data: {
        userId,
        actionType,
        actionDetails: actionDetails ?? null,
        performedBy: performedBy || userId,
        ipAddress: finalIp,
      },
    });

    console.log("Audit Created Successfully:", auditLog);

    return auditLog;
  } catch (error) {
    throw error;
  }
};