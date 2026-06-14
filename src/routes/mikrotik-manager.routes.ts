import { Router } from 'express';
import { MikrotikManagerController } from '../controllers/mikrotik-manager.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

// Require authenticated JWT and check appropriate roles
router.use(authenticateJWT);
router.use(requireRole(['ADMIN', 'OPERATOR']));

// Network Discovery (MNDP / RoMON)
router.get('/discover', MikrotikManagerController.discoverNetwork);

// Diagnostics
router.post('/ping', MikrotikManagerController.pingTarget);

// System Management
router.get('/logs', MikrotikManagerController.getSystemLogs);
router.post('/reboot', MikrotikManagerController.rebootRouter);
router.post('/backup', MikrotikManagerController.createBackupFile);

// Interface & Wireless Routes
router.get('/interfaces', MikrotikManagerController.getInterfaces);
router.post('/interfaces/set-state', MikrotikManagerController.setInterfaceState);
router.post('/interfaces/wireless/configure', MikrotikManagerController.configureWireless);
router.get('/interfaces/:interfaceName/traffic', MikrotikManagerController.monitorTraffic);

// IP & DHCP Routes
router.get('/ip-dhcp', MikrotikManagerController.getIpDhcpData);

// PPP Routes
router.get('/ppp', MikrotikManagerController.getPppData);

// Simple Queues Routes
router.get('/queues', MikrotikManagerController.getQueues);

// Firewall & NAT Routes
router.get('/firewall', MikrotikManagerController.getFirewallData);

// Custom Command execution route
router.post('/command', MikrotikManagerController.runRawCommand);

export default router;
