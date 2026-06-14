import { PrismaClient } from '@prisma/client';

// Leer URLs desde el entorno o usar las que el usuario provea
const SOURCE_URL = process.env.SOURCE_DB_URL; // Clever Cloud
const TARGET_URL = process.env.DIRECT_URL; // Supabase (directo)

if (!SOURCE_URL || !TARGET_URL) {
  console.error('❌ Faltan variables de entorno.');
  console.error('Por favor define DATABASE_URL (origen) y TARGET_DB_URL (destino en Supabase).');
  process.exit(1);
}

const sourceDb = new PrismaClient({ datasourceUrl: SOURCE_URL });
const targetDb = new PrismaClient({ datasourceUrl: TARGET_URL });

async function migrateData() {
  console.log('🚀 Iniciando copiado de datos: Clever Cloud -> Supabase');
  
  try {
    // 1. Users
    const users = await sourceDb.user.findMany();
    if (users.length > 0) {
      console.log(`Copiando ${users.length} Usuarios...`);
      await targetDb.user.createMany({ data: users, skipDuplicates: true });
    }

    // 2. Plans
    const plans = await sourceDb.plan.findMany();
    if (plans.length > 0) {
      console.log(`Copiando ${plans.length} Planes...`);
      await targetDb.plan.createMany({ data: plans, skipDuplicates: true });
    }

    // 3. Nodes
    const nodes = await sourceDb.node.findMany();
    if (nodes.length > 0) {
      console.log(`Copiando ${nodes.length} Nodos...`);
      await targetDb.node.createMany({ data: nodes, skipDuplicates: true });
    }

    // 4. Clients
    const clients = await sourceDb.client.findMany();
    if (clients.length > 0) {
      console.log(`Copiando ${clients.length} Clientes...`);
      // Convertir Decimal/etc a lo necesario si createMany falla, pero Prisma suele manejarlo
      await targetDb.client.createMany({ data: clients, skipDuplicates: true });
    }

    // 5. ServiceContracts
    const contracts = await sourceDb.serviceContract.findMany();
    if (contracts.length > 0) {
      console.log(`Copiando ${contracts.length} Contratos...`);
      await targetDb.serviceContract.createMany({ data: contracts, skipDuplicates: true });
    }

    // 6. Invoices
    const invoices = await sourceDb.invoice.findMany();
    if (invoices.length > 0) {
      console.log(`Copiando ${invoices.length} Facturas...`);
      await targetDb.invoice.createMany({ data: invoices, skipDuplicates: true });
    }

    // 7. Payments
    const payments = await sourceDb.payment.findMany();
    if (payments.length > 0) {
      console.log(`Copiando ${payments.length} Pagos...`);
      await targetDb.payment.createMany({ data: payments, skipDuplicates: true });
    }

    // 8. MikrotikActions
    const actions = await sourceDb.mikrotikAction.findMany();
    if (actions.length > 0) {
      console.log(`Copiando ${actions.length} Acciones de Mikrotik...`);
      // Transformar json si es necesario, createMany usualmente lo toma bien
      const mappedActions = actions.map(a => ({
        ...a,
        response: a.response ? JSON.parse(JSON.stringify(a.response)) : null
      }));
      await targetDb.mikrotikAction.createMany({ data: mappedActions, skipDuplicates: true });
    }

    // 9. AuditLogs
    const logs = await sourceDb.auditLog.findMany();
    if (logs.length > 0) {
      console.log(`Copiando ${logs.length} Logs de Auditoría...`);
      const mappedLogs = logs.map(l => ({
        ...l,
        dataBefore: l.dataBefore ? JSON.parse(JSON.stringify(l.dataBefore)) : null,
        dataAfter: l.dataAfter ? JSON.parse(JSON.stringify(l.dataAfter)) : null,
        changes: l.changes ? JSON.parse(JSON.stringify(l.changes)) : null,
      }));
      // Dividimos en batches por si son muchos
      const batchSize = 1000;
      for (let i = 0; i < mappedLogs.length; i += batchSize) {
        await targetDb.auditLog.createMany({
          data: mappedLogs.slice(i, i + batchSize),
          skipDuplicates: true
        });
      }
    }

    // 10. ImportLogs
    const importLogs = await sourceDb.importLog.findMany();
    if (importLogs.length > 0) {
      console.log(`Copiando ${importLogs.length} Logs de Importación...`);
      const mappedImportLogs = importLogs.map(il => ({
        ...il,
        errors: il.errors ? JSON.parse(JSON.stringify(il.errors)) : null,
        warnings: il.warnings ? JSON.parse(JSON.stringify(il.warnings)) : null,
        summary: il.summary ? JSON.parse(JSON.stringify(il.summary)) : null,
      }));
      await targetDb.importLog.createMany({ data: mappedImportLogs, skipDuplicates: true });
    }

    console.log('✅ ¡Migración de datos completada con éxito!');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    await sourceDb.$disconnect();
    await targetDb.$disconnect();
  }
}

migrateData();
