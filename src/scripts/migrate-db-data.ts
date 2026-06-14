import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const sourcePrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.SOURCE_DB_URL
    }
  }
});

const destPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log("Iniciando migración de datos de Clever Cloud a Supabase...");
  
  try {
    // 1. Usuarios
    console.log("Copiando usuarios...");
    const users = await sourcePrisma.user.findMany();
    if (users.length > 0) {
      await destPrisma.user.createMany({ data: users, skipDuplicates: true });
    }
    console.log(`✅ ${users.length} usuarios copiados.`);

    // 2. Planes
    console.log("Copiando planes...");
    const plans = await sourcePrisma.plan.findMany();
    if (plans.length > 0) {
      await destPrisma.plan.createMany({ data: plans, skipDuplicates: true });
    }
    console.log(`✅ ${plans.length} planes copiados.`);

    // 3. Nodos (MikroTiks)
    console.log("Copiando nodos...");
    const nodes = await sourcePrisma.node.findMany();
    if (nodes.length > 0) {
      await destPrisma.node.createMany({ data: nodes, skipDuplicates: true });
    }
    console.log(`✅ ${nodes.length} nodos copiados.`);

    // 4. Clientes
    console.log("Copiando clientes...");
    const clients = await sourcePrisma.client.findMany();
    if (clients.length > 0) {
      await destPrisma.client.createMany({ data: clients, skipDuplicates: true });
    }
    console.log(`✅ ${clients.length} clientes copiados.`);

    // 5. Contratos
    console.log("Copiando contratos...");
    const contracts = await sourcePrisma.serviceContract.findMany();
    if (contracts.length > 0) {
      await destPrisma.serviceContract.createMany({ data: contracts, skipDuplicates: true });
    }
    console.log(`✅ ${contracts.length} contratos copiados.`);

    // 6. Facturas
    console.log("Copiando facturas...");
    const invoices = await sourcePrisma.invoice.findMany();
    if (invoices.length > 0) {
      await destPrisma.invoice.createMany({ data: invoices, skipDuplicates: true });
    }
    console.log(`✅ ${invoices.length} facturas copiadas.`);

    // 7. Pagos
    console.log("Copiando pagos...");
    const payments = await sourcePrisma.payment.findMany();
    if (payments.length > 0) {
      await destPrisma.payment.createMany({ data: payments, skipDuplicates: true });
    }
    console.log(`✅ ${payments.length} pagos copiados.`);

    // 8. Logs
    console.log("Copiando logs de auditoría...");
    const auditLogs = await sourcePrisma.auditLog.findMany();
    if (auditLogs.length > 0) {
      await destPrisma.auditLog.createMany({ data: auditLogs as any, skipDuplicates: true });
    }
    console.log(`✅ ${auditLogs.length} logs copiados.`);

    console.log("🎉 Migración de datos completada exitosamente.");
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
  } finally {
    await sourcePrisma.$disconnect();
    await destPrisma.$disconnect();
  }
}

main();
