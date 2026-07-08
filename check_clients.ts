import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const contracts = await prisma.serviceContract.findMany({
    where: {
      OR: [
        { staticIp: { contains: '192.168.88' } },
        { staticIp: { contains: '254' } },
        { node: { name: { contains: 'pruebas' } } },
        { node: { mikrotikHost: { contains: '10.205' } } }
      ]
    },
    include: {
      client: true,
      node: true
    }
  });

  console.log("MATCHING CONTRACTS IN DB:");
  contracts.forEach(con => {
    console.log(`- Client: ${con.client?.fullName} (${con.client?.id})`);
    console.log(`  * Contract: ${con.id}`);
    console.log(`    Status: ${con.status}`);
    console.log(`    Node: ${con.node?.name} (${con.node?.mikrotikHost})`);
    console.log(`    Static IP: ${con.staticIp}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
