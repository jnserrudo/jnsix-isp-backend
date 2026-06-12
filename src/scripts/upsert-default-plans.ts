import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Upserting requested internet plans into database...');

  const plans = [
    {
      name: 'Plan Fibra 10 Mbps',
      downloadSpeed: 10,
      uploadSpeed: 5,
      price: 25500.00,
      mikrotikProfile: 'plan_10m',
      description: 'Velocidad básica de 10 Megas para navegación y redes sociales.',
    },
    {
      name: 'Plan Fibra 20 Mbps',
      downloadSpeed: 20,
      uploadSpeed: 10,
      price: 29500.00,
      mikrotikProfile: 'plan_20m',
      description: 'Velocidad intermedia de 20 Megas ideal para teletrabajo y streaming.',
    },
    {
      name: 'Plan Fibra 30 Mbps',
      downloadSpeed: 30,
      uploadSpeed: 15,
      price: 31500.00,
      mikrotikProfile: 'plan_30m',
      description: 'Velocidad recomendada de 30 Megas para múltiples dispositivos y streaming HD.',
    },
  ];

  for (const p of plans) {
    const existing = await prisma.plan.findFirst({
      where: {
        OR: [
          { name: p.name },
          { downloadSpeed: p.downloadSpeed }
        ]
      }
    });

    if (existing) {
      console.log(`Plan found: ${existing.name}. Updating price to $${p.price}...`);
      await prisma.plan.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          downloadSpeed: p.downloadSpeed,
          uploadSpeed: p.uploadSpeed,
          price: p.price,
          mikrotikProfile: p.mikrotikProfile,
          description: p.description,
          isActive: true
        }
      });
    } else {
      console.log(`Creating new plan: ${p.name} at $${p.price}...`);
      await prisma.plan.create({
        data: p
      });
    }
  }

  console.log('Plans database synchronization complete!');
}

main()
  .catch((e) => {
    console.error('Error upserting plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
