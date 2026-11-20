import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
export const env = {
  databaseUrl: required('DATABASE_URL'),
  accessSecret: required('JWT_ACCESS_SECRET'),
  refreshSecret: required('JWT_REFRESH_SECRET'),
  production: process.env.NODE_ENV === 'production',
};
