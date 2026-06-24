const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const nodes = await prisma.node.findMany();
  console.log(JSON.stringify(nodes, null, 2));
}

check().finally(() => prisma.$disconnect());
