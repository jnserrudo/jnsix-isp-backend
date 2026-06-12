import prisma from '../services/db.service';

const LAB_NODE_ID = '47ac0220-41fb-4bfc-aa57-fba1dc852ac8';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '=== MODO PREVIEW (no se borra nada) ===' : '=== EJECUTANDO LIMPIEZA ===');

  // 1. Find all contracts linked to the lab node
  const contracts = await prisma.serviceContract.findMany({
    where: { nodeId: LAB_NODE_ID },
    include: {
      client: { select: { id: true, fullName: true, dni: true } },
      invoices: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
      mikrotikActions: { select: { id: true } },
    },
  });

  console.log(`\nContratos vinculados a Mikrotik-Laboratorio: ${contracts.length}`);

  // Collect unique client IDs
  const clientIds = [...new Set(contracts.map(c => c.clientId))];
  console.log(`Clientes únicos a eliminar: ${clientIds.length}`);

  // Count related records
  const totalInvoices = contracts.reduce((sum, c) => sum + c.invoices.length, 0);
  const totalActions = contracts.reduce((sum, c) => sum + c.mikrotikActions.length, 0);

  // Count payments linked to those invoices
  const invoiceIds = contracts.flatMap(c => c.invoices.map(i => i.id));
  const totalPayments = await prisma.payment.count({ where: { invoiceId: { in: invoiceIds } } });

  console.log(`Facturas a eliminar: ${totalInvoices}`);
  console.log(`Pagos a eliminar: ${totalPayments}`);
  console.log(`Acciones MikroTik a eliminar: ${totalActions}`);

  // Show first 10 clients as sample
  console.log('\n--- Muestra de clientes a eliminar ---');
  const sampleClients = contracts.slice(0, 10).map(c => ({
    nombre: c.client.fullName,
    dni: c.client.dni,
    pppoe: c.pppoeUsername,
  }));
  console.table(sampleClients);

  if (DRY_RUN) {
    console.log('\n✅ Preview finalizado. Para ejecutar de verdad, corré sin --dry-run');
    return;
  }

  // === EXECUTE DELETION ===
  console.log('\n🗑️  Eliminando datos...');

  // Delete clients (cascade will handle contracts, invoices, payments, mikrotik actions)
  const deleted = await prisma.client.deleteMany({
    where: { id: { in: clientIds } },
  });

  console.log(`\n✅ Se eliminaron ${deleted.count} clientes y toda su data relacionada.`);

  // Verify the lab node now has 0 contracts
  const remaining = await prisma.serviceContract.count({ where: { nodeId: LAB_NODE_ID } });
  console.log(`Contratos restantes en Mikrotik-Laboratorio: ${remaining}`);
}

main()
  .catch(e => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
