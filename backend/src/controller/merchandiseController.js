import { PrismaClient } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});


export async function getProductList() {
    try {
        const products = await prisma.ProductFamily.findMany();
        return products;
    } catch (error) {
        console.error(error);
        throw new Error('Internal Server Error');
    }
}

