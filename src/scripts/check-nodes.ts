import prisma from '../services/db.service';
async function main() {
  const nodes = await prisma.node.findMany({ include: { contracts: true } });
  console.log(nodes.map(n => ({ name: n.name, id: n.id, contractsCount: n.contracts.length })));
}
main().finally(() => prisma.$disconnect());
