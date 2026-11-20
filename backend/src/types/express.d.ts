import type { Role, AccountStatus } from '../generated/enums.js';
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: Role; status: AccountStatus };
      correlationId: string;
    }
  }
}
export {};
