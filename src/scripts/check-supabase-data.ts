import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const destPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log("Verificando datos en Supabase...");
  try {
    const userCount = await destPrisma.user.count();
    const clientCount = await destPrisma.client.count();
    const contractCount = await destPrisma.serviceContract.count();
    const invoiceCount = await destPrisma.invoice.count();
    const planCount = await destPrisma.plan.count();
    const nodeCount = await destPrisma.node.count();
    
    console.log(`Usuarios: ${userCount}`);
    console.log(`Clientes: ${clientCount}`);
    console.log(`Contratos: ${contractCount}`);
    console.log(`Facturas: ${invoiceCount}`);
    console.log(`Planes: ${planCount}`);
    console.log(`Nodos: ${nodeCount}`);
  } catch (error) {
    console.error("Error conectando a Supabase:", error);
  } finally {
    await destPrisma.$disconnect();
  }
}

main();
