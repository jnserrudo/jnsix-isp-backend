import { MigrationService } from '../services/migration.service';
import prisma from '../services/db.service';
import logger from '../utils/logger';

async function run() {
  console.log("Iniciando script de migración para clientes faltantes...");

  const nodes = await prisma.node.findMany();
  if (nodes.length === 0) {
    console.log("No hay nodos configurados en la base de datos.");
    return;
  }
  
  // Asumimos que se migra al primer nodo (Vaqueros)
  const targetNode = nodes[0];
  console.log(`Analizando datos para el nodo: ${targetNode.name} (${targetNode.id})`);

  let analysis;
  try {
    analysis = await MigrationService.analyzeMigration(targetNode.id);
  } catch (err) {
    console.error("Error al analizar el archivo Excel/JSON:", err);
    return;
  }

  // Buscar clientes existentes en la base de datos para no duplicar
  const existingClients = await prisma.client.findMany({ 
    select: { dni: true, fullName: true } 
  });
  
  const existingNames = new Set(existingClients.map(c => c.fullName.trim().toLowerCase()));
  const existingDnis = new Set(existingClients.map(c => c.dni));

  // Filtrar los que ya existen
  const missingClients = analysis.clients.filter((c: any) => {
    return !existingNames.has(c.fullName.trim().toLowerCase()) && !existingDnis.has(c.tempDni);
  });

  console.log(`Se encontraron ${missingClients.length} clientes faltantes de un total de ${analysis.clients.length} en el archivo.`);

  if (missingClients.length === 0) {
    console.log("Todos los clientes ya están migrados.");
    return;
  }

  // Armar el objeto para ejecutar la migración
  const mappings: any[] = missingClients.map((c: any) => {
    const isPppoe = c.suggestedMatch?.type === 'PPPoE';
    return {
      fullName: c.fullName,
      dni: c.tempDni,
      phone: c.phone,
      address: c.address,
      planId: c.suggestedPlanId,
      connectionMode: isPppoe ? 'PPPoE' : 'StaticIP',
      pppoeUsername: isPppoe ? c.suggestedMatch.name : undefined,
      // Contraseña por defecto para PPPoE si no se sabe, usando el mismo usuario
      pppoePassword: isPppoe ? c.suggestedMatch.name : undefined, 
      staticIp: !isPppoe ? c.suggestedMatch?.name : undefined,
      status: c.status,
      monto: c.price,
      suggestedMatch: c.suggestedMatch
    };
  });

  console.log("Ejecutando migración para los clientes faltantes. Esto puede tomar unos minutos...");
  
  try {
    const result = await MigrationService.executeMigration(targetNode.id, mappings, 'SYSTEM_SCRIPT');
    console.log("=== Resultados de la Migración ===");
    console.log(`Importados exitosamente: ${result.importedCount}`);
    console.log(`Errores: ${result.errorCount}`);
    if (result.errorCount > 0) {
      console.log("Detalle de errores:");
      result.errors.forEach((e: any) => console.log(`- ${e.clientName}: ${e.error}`));
    }
  } catch (err) {
    console.error("Error crítico durante la migración:", err);
  }
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    console.log("Proceso finalizado.");
  });
