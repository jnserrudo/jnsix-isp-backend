import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando sembrado completo de datos de prueba para JNSIX ISP...');

  // Clear existing database to avoid duplicates (Cascade delete handles relations)
  console.log('Limpiando tablas de base de datos...');
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.mikrotikAction.deleteMany({});
  await prisma.serviceContract.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.node.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Create admin and operator users
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@jnsix.com',
      password: hashedPassword,
      fullName: 'Administrador Principal',
      role: 'ADMIN',
    },
  });

  const operator = await prisma.user.create({
    data: {
      email: 'operador@jnsix.com',
      password: hashedPassword,
      fullName: 'Soporte Técnico Nahuel',
      role: 'OPERATOR',
    },
  });

  console.log('Usuarios creados: admin@jnsix.com y operador@jnsix.com');

  // 2. Create Service Plans
  const plan10 = await prisma.plan.create({
    data: {
      name: 'Plan Fibra 10 Mbps',
      downloadSpeed: 10,
      uploadSpeed: 5,
      price: 25500.00,
      mikrotikProfile: 'plan_10m',
      description: 'Velocidad básica de 10 Megas para navegación y redes sociales.',
    },
  });

  const plan20 = await prisma.plan.create({
    data: {
      name: 'Plan Fibra 20 Mbps',
      downloadSpeed: 20,
      uploadSpeed: 10,
      price: 29500.00,
      mikrotikProfile: 'plan_20m',
      description: 'Velocidad intermedia de 20 Megas ideal para teletrabajo y streaming.',
    },
  });

  const plan30 = await prisma.plan.create({
    data: {
      name: 'Plan Fibra 30 Mbps',
      downloadSpeed: 30,
      uploadSpeed: 15,
      price: 31500.00,
      mikrotikProfile: 'plan_30m',
      description: 'Velocidad recomendada de 30 Megas para múltiples dispositivos y streaming HD.',
    },
  });

  console.log('Planes creados: 10 Mbps ($25.500), 20 Mbps ($29.500), 30 Mbps ($31.500).');

  // 3. Create Infrastructure Nodes
  const nodeTorre = await prisma.node.create({
    data: {
      name: 'MikroTik Principal - Torre Centro',
      address: 'Avenida de Mayo 450, Piso 12',
      latitude: -34.6083,
      longitude: -58.3721,
      mikrotikHost: '127.0.0.1', // Activará simulador local
      mikrotikPort: 8728,
      mikrotikUser: 'api_jnsix',
      mikrotikPassword: 'securepassword123',
      oltHost: '192.168.10.10',
      oltType: 'VSOL_GPON',
      notes: 'Nodo central de distribución. Rack principal con UPS backup y fuente rectificadora 24V.',
    },
  });

  console.log('Nodos creados: MikroTik Principal - Torre Centro.');

  // 4. Create Clients (Active, Suspended, Delinquent)
  const client1 = await prisma.client.create({
    data: {
      fullName: 'Carlos Gómez',
      dni: '28456123',
      phone1: '1154567890',
      phone2: '1143219876',
      email: 'carlos.gomez@gmail.com',
      address: 'Rivadavia 2045, Departamento 3B, CABA',
      latitude: -34.6095,
      longitude: -58.3960,
      installationDate: new Date('2025-01-15'),
      status: 'ACTIVE',
      notes: 'Caja NAP en poste frente a la puerta del edificio. Cable canalizado por cochera.',
    },
  });

  const client2 = await prisma.client.create({
    data: {
      fullName: 'María Rodríguez',
      dni: '32987654',
      phone1: '1133334444',
      email: 'maria.rod@hotmail.com',
      address: 'San Martín 840, Casa de rejas negras, Ramos Mejía',
      latitude: -34.6465,
      longitude: -58.5630,
      installationDate: new Date('2025-03-10'),
      status: 'SUSPENDED', // Suspendido por falta de pago
      notes: 'ONU colocada en comedor principal. Ingreso de fibra por patio lateral.',
    },
  });

  const client3 = await prisma.client.create({
    data: {
      fullName: 'Esteban Altieri',
      dni: '22145789',
      phone1: '1165432109',
      email: 'e.altieri@yahoo.com.ar',
      address: 'Av. Corrientes 3420, Piso 6, CABA',
      latitude: -34.6030,
      longitude: -58.4110,
      installationDate: new Date('2025-04-02'),
      status: 'ACTIVE',
      notes: 'Edificio con ducto técnico interno habilitado. Fibra rotulada en caja NAP del piso 6.',
    },
  });

  console.log('Clientes creados: Carlos Gómez (Activo), María Rodríguez (Suspendido), Esteban Altieri (Activo)');

  // 5. Create Service Contracts for Clients
  // Carlos Gómez: Plan 20 Mbps en Torre Centro, PPPoE
  const contract1 = await prisma.serviceContract.create({
    data: {
      clientId: client1.id,
      planId: plan20.id,
      nodeId: nodeTorre.id,
      billingDay: 5,
      graceDays: 5,
      pppoeUsername: 'carlos_gomez_20',
      pppoePassword: 'passpppoe123',
      onuSerial: 'VSOL00E1D2C3',
      onuModel: 'VSOL XPON',
      contractStart: new Date('2025-01-15'),
      status: 'ACTIVE',
    },
  });

  // María Rodríguez: Plan 10 Mbps en Torre Centro, IP Fija (Está suspendida)
  const contract2 = await prisma.serviceContract.create({
    data: {
      clientId: client2.id,
      planId: plan10.id,
      nodeId: nodeTorre.id,
      billingDay: 1, // Vence rápido
      graceDays: 3,
      staticIp: '192.168.100.45',
      macAddress: '00:1A:2B:3C:4D:5E',
      onuSerial: 'BTPON88A9B7C',
      onuModel: 'BT-226XR 1GE',
      contractStart: new Date('2025-03-10'),
      status: 'SUSPENDED',
    },
  });

  // Esteban Altieri: Plan 30 Mbps en Torre Centro, PPPoE
  const contract3 = await prisma.serviceContract.create({
    data: {
      clientId: client3.id,
      planId: plan30.id,
      nodeId: nodeTorre.id,
      billingDay: 10,
      graceDays: 5,
      pppoeUsername: 'esteban_altieri_30',
      pppoePassword: 'passpppoe456',
      onuSerial: 'VSOL00F9F8F7',
      onuModel: 'VSOL XPON',
      contractStart: new Date('2025-04-02'),
      status: 'ACTIVE',
    },
  });

  console.log('Contratos creados vinculando clientes a MikroTik');

  // 6. Create Invoices (Paid, Pending, Overdue)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Carlos Gómez: Factura de este mes (PAGADA)
  const invoice1 = await prisma.invoice.create({
    data: {
      contractId: contract1.id,
      clientId: client1.id,
      invoiceNumber: `FAC-${currentYear}${(currentMonth + 1).toString().padStart(2, '0')}-CG01`,
      periodStart: new Date(currentYear, currentMonth, 1),
      periodEnd: new Date(currentYear, currentMonth + 1, 0),
      amount: plan20.price,
      status: 'PAID',
      dueDate: new Date(currentYear, currentMonth, 15),
      issuedAt: new Date(currentYear, currentMonth, 5),
      paidAt: new Date(currentYear, currentMonth, 10),
      notes: 'Pago recibido por transferencia bancaria.',
    },
  });

  // Carlos Gómez: Registro del pago
  await prisma.payment.create({
    data: {
      invoiceId: invoice1.id,
      clientId: client1.id,
      amount: plan20.price,
      paymentMethod: 'TRANSFER',
      paymentDate: new Date(currentYear, currentMonth, 10),
      reference: 'TRANSF-CBU-9823412',
      receivedById: operator.id,
      notes: 'Comprobante verificado por operador.',
    },
  });

  // María Rodríguez: Factura vencida y en mora (PENDIENTE / VENCIDA)
  // Venció el día 4 del mes actual
  const invoice2 = await prisma.invoice.create({
    data: {
      contractId: contract2.id,
      clientId: client2.id,
      invoiceNumber: `FAC-${currentYear}${(currentMonth + 1).toString().padStart(2, '0')}-MR02`,
      periodStart: new Date(currentYear, currentMonth, 1),
      periodEnd: new Date(currentYear, currentMonth + 1, 0),
      amount: plan10.price,
      status: 'OVERDUE',
      dueDate: new Date(currentYear, currentMonth, 4),
      issuedAt: new Date(currentYear, currentMonth, 1),
      notes: 'Abonado no registra pago. Plazo de gracia expirado.',
    },
  });

  // Esteban Altieri: Factura de este mes (PENDIENTE, pero en fecha de pago)
  await prisma.invoice.create({
    data: {
      contractId: contract3.id,
      clientId: client3.id,
      invoiceNumber: `FAC-${currentYear}${(currentMonth + 1).toString().padStart(2, '0')}-EA03`,
      periodStart: new Date(currentYear, currentMonth, 1),
      periodEnd: new Date(currentYear, currentMonth + 1, 0),
      amount: plan30.price,
      status: 'PENDING',
      dueDate: new Date(currentYear, currentMonth, 20),
      issuedAt: new Date(currentYear, currentMonth, 10),
      notes: 'Factura emitida para cobro habitual.',
    },
  });

  console.log('Facturas y cobros registrados (Carlos: Pagada, María: Vencida, Esteban: Pendiente)');

  // 7. Create MikroTik Action Logs
  // Log de corte para María Rodríguez
  await prisma.mikrotikAction.create({
    data: {
      contractId: contract2.id,
      nodeId: nodeTorre.id,
      actionType: 'BLOCK',
      status: 'SUCCESS',
      executedAt: new Date(currentYear, currentMonth, 8),
      response: { mode: 'address-list', ip: '192.168.100.45', action: 'added' },
      triggeredBy: 'CRON_JOB',
    },
  });

  // Log de prueba de conexión al router
  await prisma.mikrotikAction.create({
    data: {
      contractId: contract1.id,
      nodeId: nodeTorre.id,
      actionType: 'TEST_CONNECTION',
      status: 'SUCCESS',
      executedAt: new Date(),
      response: { status: 'online', resources: { uptime: '14d2h45m', cpu: '5%' } },
      triggeredBy: 'MANUAL',
    },
  });

  console.log('Logs de acciones MikroTik agregados.');

  console.log('--- SEMBRADO EXITOSO Y COMPLETO DE JNSIX ISP ---');
  console.log('Credenciales de Acceso:');
  console.log('Admin: admin@jnsix.com / admin123');
  console.log('Operador: operador@jnsix.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
