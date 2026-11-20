import { prisma } from '../lib/prisma.js';

export async function getProductList() {
  return prisma.productFamily.findMany();
}
