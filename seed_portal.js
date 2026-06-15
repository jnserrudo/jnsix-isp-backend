const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find the first client
  const client = await prisma.client.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!client) {
    console.log('No hay clientes en la base de datos');
    return;
  }

  // Update their code
  const updated = await prisma.client.update({
    where: { id: client.id },
    data: { clientCode: 'TEST-123' }
  });

  console.log('--- CLIENTE ACTUALIZADO PARA PRUEBA DE PORTAL ---');
  console.log('Nombre:', updated.fullName);
  console.log('DNI:', updated.dni);
  console.log('Código de Cliente:', updated.clientCode);
  console.log('URL Portal: http://localhost:5173/portal');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
