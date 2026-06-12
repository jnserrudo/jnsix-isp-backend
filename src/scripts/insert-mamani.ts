import prisma from '../services/db.service';

async function main() {
  try {
    // 1. Obtener el Nodo (asumiendo que hay 1 principal, o tomamos el primero)
    const node = await prisma.node.findFirst();
    if (!node) throw new Error('No hay nodos registrados');

    // 2. Obtener un Plan (podemos tomar el primero activo)
    const plan = await prisma.plan.findFirst({ where: { isActive: true } });
    if (!plan) throw new Error('No hay planes registrados');

    console.log(`Usando Nodo: ${node.name} (ID: ${node.id})`);
    console.log(`Usando Plan: ${plan.name} (ID: ${plan.id})`);

    // 3. Crear el Cliente
    // Reemplaza "mamani-soledad" con el usuario PPPoE real que tenga en el MikroTik si lo conoces
    const pppoeUser = 'mamani-soledad'; 

    const client = await prisma.client.create({
      data: {
        fullName: 'Mamani Soledad chato pino',
        dni: 'TEMP-MAMANI', // DNI temporal
        address: 'Sin dirección',
        status: 'ACTIVE',
        notes: '[MIGRATION_METADATA]{"matched":false,"confidence":0}[MIGRATION_METADATA]Importado manualmente por script.'
      }
    });

    console.log(`Cliente creado con ID: ${client.id}`);

    // 4. Crear el Contrato de Servicio
    const contract = await prisma.serviceContract.create({
      data: {
        clientId: client.id,
        planId: plan.id,
        nodeId: node.id,
        billingDay: 5,
        graceDays: 5,
        status: 'ACTIVE', 
        pppoeUsername: pppoeUser, 
        contractStart: new Date()
      }
    });

    console.log(`Contrato creado con ID: ${contract.id}`);

    // 5. Crear la factura pendiente (asumiendo que es morosa como los demás, si no lo es, puedes omitir esto)
    const invoiceNumber = `MIG-FAC-${Date.now()}-123`;
    await prisma.invoice.create({
      data: {
        contractId: contract.id,
        clientId: client.id,
        invoiceNumber,
        periodStart: new Date(2026, 4, 1), // Mayo 2026
        periodEnd: new Date(2026, 4, 31),
        amount: plan.price,
        status: 'OVERDUE',
        dueDate: new Date(2026, 4, 15)
      }
    });

    console.log(`Factura vencida generada con éxito.`);
    console.log('¡Proceso completado exitosamente!');

  } catch (err) {
    console.error('Error insertando cliente:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
