import { PrismaClient } from '@prisma/client';
import { MigrationService } from '../services/migration.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching first node...');
  const node = await prisma.node.findFirst();
  if (!node) {
    console.error('No nodes found in database!');
    return;
  }
  console.log(`Analyzing node: ${node.name} (${node.id})`);
  const result = await MigrationService.analyzeMigration(node.id);
  
  const testClients = result.clients.filter((c: any) => 
    c.fullName.includes('Micaela Alancay') || 
    c.fullName.includes('Claudia Vargas') ||
    c.fullName.includes('Dalma')
  );

  console.log('Result for test clients:');
  console.log(JSON.stringify(testClients, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
