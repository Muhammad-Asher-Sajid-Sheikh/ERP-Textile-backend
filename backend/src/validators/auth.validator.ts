import { z } from 'zod';
import { Role } from '../generated/enums.js';
export const roleValue = z.string().transform(value => value.toUpperCase()).pipe(z.enum(Role));
const text = z.string().min(1);
export const registerInput = z.object({ email: z.email(), password: text, confirmPassword: text, name: text, role: roleValue });
export const loginInput = z.object({ email: z.email(), password: text });
export const passwordInput = z.object({ currentPassword: text, newPassword: text, confirmPassword: text });
export const roleInput = z.object({ role: roleValue });
export const reasonInput = z.object({ reason: z.string().optional() });
// Legacy auth migrations may have converted integer IDs to text; do not require UUIDs here.
export const authIdInput = z.object({ id: text });
