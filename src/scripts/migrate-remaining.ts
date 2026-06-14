import prisma from '../services/db.service';
import { MigrationService } from '../services/migration.service';
import logger from '../utils/logger';

async function main() {
  console.log('=== MIGRACIÓN DE CLIENTES RESTANTES ===');

  // 1. Find the Vaqueros node
  const nodes = await prisma.node.findMany();
  console.log('\nNodos registrados en la base de datos:');
  console.table(nodes.map(n => ({ id: n.id, name: n.name, host: n.mikrotikHost })));

  const vaquerosNode = nodes.find(n => n.name.toLowerCase().includes('vaquero'));
  if (!vaquerosNode) {
    console.error('\n❌ Error: No se encontró un nodo con el nombre "Vaqueros". Asegúrate de que el nodo esté creado.');
    process.exit(1);
  }

  console.log(`\n📌 Nodo seleccionado para migración: "${vaquerosNode.name}" (${vaquerosNode.id})`);

  // 2. Run analysis to get matches and plans mappings
  console.log('\n⏳ Analizando datos de Excel y comparando con MikroTik (esto puede tardar unos segundos)...');
  const analysis = await MigrationService.analyzeMigration(vaquerosNode.id);
  if (!analysis || !analysis.clients) {
    console.error('❌ Error: El análisis de migración no devolvió clientes.');
    process.exit(1);
  }

  const excelClients = analysis.clients;
  console.log(`📋 Total de clientes en Excel: ${excelClients.length}`);

  // 3. Find existing clients in database to filter them out
  const dbClients = await prisma.client.findMany({
    select: { fullName: true, dni: true }
  });

  const existingDnis = new Set(dbClients.map(c => c.dni));
  const existingNames = new Set(dbClients.map(c => c.fullName.toLowerCase().trim()));

  // Filter clients that are NOT yet in the database
  const remainingClients = excelClients.filter((ec: any) => {
    const nameClean = ec.fullName.toLowerCase().trim();
    return !existingDnis.has(ec.tempDni) && !existingNames.has(nameClean);
  });

  console.log(`🔍 Clientes que ya existen en la base de datos: ${dbClients.length}`);
  console.log(`🚀 Clientes pendientes de migración: ${remainingClients.length}`);

  if (remainingClients.length === 0) {
    console.log('\n✅ ¡Todos los clientes ya están migrados! No hay pendientes.');
    return;
  }

  // Get an admin user ID for audit log purposes
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  });
  if (!adminUser) {
    console.error('❌ Error: No se encontró ningún usuario con rol ADMIN en la base de datos para registrar la auditoría.');
    process.exit(1);
  }

  console.log(`👤 Usuario administrador para auditoría: ${adminUser.email}`);
  console.log('\n--- Iniciando importación secuencial para evitar timeouts ---');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < remainingClients.length; i++) {
    const client = remainingClients[i];
    const indexStr = `[${i + 1}/${remainingClients.length}]`;
    console.log(`⏳ ${indexStr} Migrando: ${client.fullName}...`);

    // Map client to MigrationMappingInput format
    const mapping = {
      fullName: client.fullName,
      dni: client.tempDni, // Using the generated unique temp DNI
      phone: client.phone || undefined,
      address: client.address,
      planId: client.suggestedPlanId,
      connectionMode: client.suggestedMatch?.type || 'PPPoE',
      pppoeUsername: client.suggestedMatch?.type === 'PPPoE' ? client.suggestedMatch.name : undefined,
      pppoePassword: client.suggestedMatch?.type === 'PPPoE' ? (client.suggestedMatch.details?.password || '123456') : undefined,
      staticIp: client.suggestedMatch?.type === 'StaticIP' ? client.suggestedMatch.name : undefined,
      macAddress: client.suggestedMatch?.type === 'StaticIP' ? client.suggestedMatch.details?.['mac-address'] : undefined,
      status: client.status,
      monto: client.price || undefined,
      suggestedMatch: client.suggestedMatch || undefined
    };

    try {
      // Execute migration for 1 single client to be 100% safe from timeouts and connection limits
      const res = await MigrationService.executeMigration(vaquerosNode.id, [mapping], adminUser.id);
      
      if (res.success && res.importedCount > 0) {
        console.log(`   ✅ Éxito! (${mapping.connectionMode}${mapping.suggestedMatch ? ` - Coincidencia ${mapping.suggestedMatch.confidence}%` : ' - Sin coincidencia'})`);
        successCount++;
      } else {
        const errMsg = res.errors[0]?.error || 'Error desconocido';
        console.log(`   ❌ Falló: ${errMsg}`);
        failCount++;
      }
    } catch (err: any) {
      console.log(`   ❌ Falló debido a excepción: ${err.message || err}`);
      failCount++;
    }

    // Add a small delay between requests to keep the database happy and connection released
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n=== MIGRACIÓN FINALIZADA ===');
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Fallidos: ${failCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error crítico en script de migración:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
