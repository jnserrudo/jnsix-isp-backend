import { Request, Response } from 'express';
import { MikrotikManagerService } from '../services/mikrotik-manager.service';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class MikrotikManagerController {
  /**
   * Helper to parse JSON error from service, or construct standard error payload
   */
  private static handleError(res: Response, err: any, defaultActionDesc: string) {
    try {
      // Check if the error is a serialized command metadata error
      const errObj = JSON.parse(err.message);
      if (errObj && errObj.command) {
        return res.status(500).json({
          success: false,
          message: errObj.friendlyMessage,
          errorDetails: errObj.rawError,
          log: {
            command: errObj.command,
            args: errObj.args,
            friendlyMessage: errObj.friendlyMessage,
            timestamp: errObj.timestamp,
            success: false,
          },
        });
      }
    } catch (e) {
      // Not a JSON-serialized command error
    }

    logger.error(`Error no controlado en MikrotikManagerController: ${err.message || err}`);
    return res.status(500).json({
      success: false,
      message: `Error interno al intentar: ${defaultActionDesc.toLowerCase()}.`,
      errorDetails: err.message || String(err),
    });
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/interfaces
   */
  static async getInterfaces(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.getInterfaces(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/interface/print & /interface/wireless/print',
          friendlyMessage: 'Consulta de interfaces físicas e inalámbricas completada con éxito.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Consultar interfaces de red');
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/interfaces/set-state
   */
  static async setInterfaceState(req: Request, res: Response) {
    const { nodeId } = req.params;
    const { name, disabled } = req.body;

    if (!name || disabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros requeridos: name (nombre de interfaz) y disabled (booleano).',
      });
    }

    try {
      const result = await MikrotikManagerService.setInterfaceState(nodeId, name, disabled);
      
      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        entityId: nodeId,
        action: AuditAction.UPDATE,
        description: `Interfaz ${name} configurada como ${disabled ? 'deshabilitada' : 'habilitada'} en nodo ${nodeId}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json(result);
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, `Cambiar estado de interfaz ${name}`);
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/interfaces/wireless/configure
   */
  static async configureWireless(req: Request, res: Response) {
    const { nodeId } = req.params;
    const { name, ssid, frequency, disabled } = req.body;

    if (!name || !ssid) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros requeridos: name (nombre de interfaz wlan) y ssid.',
      });
    }

    try {
      const result = await MikrotikManagerService.configureWireless(nodeId, name, ssid, frequency, disabled);
      
      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        entityId: nodeId,
        action: AuditAction.UPDATE,
        description: `Configuración inalámbrica cambiada en interfaz ${name} (SSID: ${ssid}) en nodo ${nodeId}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json(result);
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, `Configurar interfaz inalámbrica ${name}`);
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/interfaces/:interfaceName/traffic
   */
  static async monitorTraffic(req: Request, res: Response) {
    const { nodeId, interfaceName } = req.params;
    try {
      const result = await MikrotikManagerService.monitorInterfaceTraffic(nodeId, interfaceName);
      return res.json(result);
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, `Monitorear tráfico de interfaz ${interfaceName}`);
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/ip-dhcp
   */
  static async getIpDhcpData(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.getIpDhcpData(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/ip/address/print & /ip/dhcp-server/lease/print & /ip/arp/print',
          friendlyMessage: 'Consulta de direccionamiento IP, DHCP leases y tablas ARP completada.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Obtener direccionamiento IP y DHCP');
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/ppp
   */
  static async getPppData(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.getPppData(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/ppp/secret/print & /ppp/active/print & /ppp/profile/print',
          friendlyMessage: 'Lectura de secretos, perfiles y sesiones activas PPPoE finalizada.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Obtener información PPPoE');
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/queues
   */
  static async getQueues(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const queues = await MikrotikManagerService.getQueues(nodeId);
      return res.json({
        success: true,
        data: queues,
        log: {
          command: '/queue/simple/print',
          friendlyMessage: 'Listado de colas simples de limitación de ancho de banda cargado.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Obtener colas de ancho de banda');
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/firewall
   */
  static async getFirewallData(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.getFirewallData(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/ip/firewall/nat/print & /ip/firewall/filter/print & /ip/firewall/address-list/print',
          friendlyMessage: 'Lectura de reglas NAT, filtros de firewall y address lists completada.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Consultar tablas del Firewall');
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/command
   */
  static async runRawCommand(req: Request, res: Response) {
    const { nodeId } = req.params;
    const { command, args, friendlyActionDesc } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        message: 'Falta parámetro requerido: command (ej: /ip/dns/print).',
      });
    }

    try {
      const result = await MikrotikManagerService.runCommand(
        nodeId,
        command,
        args,
        friendlyActionDesc || `Ejecución de comando: ${command}`
      );
      
      const user = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        entityId: nodeId,
        action: AuditAction.UPDATE,
        description: `Comando crudo ejecutado en nodo ${nodeId}: ${command}`,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: { command, args }
      });

      return res.json(result);
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, `Ejecutar comando RouterOS: ${command}`);
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/discover
   */
  static async discoverNetwork(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.discoverNetwork(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/ip/neighbor/print & /tool/romon/discover',
          friendlyMessage: 'Escaneo de red completado. Se han descubierto routers vecinos y nodos RoMON.',
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Descubrir red y nodos vecinos');
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/ping
   */
  static async pingTarget(req: Request, res: Response) {
    const { nodeId } = req.params;
    const { address, count } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Address is required for ping' });
    }
    try {
      const data = await MikrotikManagerService.ping(nodeId, address, count || 4);
      return res.json({
        success: true,
        data,
        log: {
          command: `/ping address=${address} count=${count || 4}`,
          friendlyMessage: `Diagnóstico ping completado hacia ${address}`,
          timestamp: new Date().toISOString(),
          success: true,
        },
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, `Diagnóstico ping hacia ${address}`);
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/logs
   */
  static async getSystemLogs(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const logs = await MikrotikManagerService.getLogs(nodeId);
      return res.json({ success: true, data: logs });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Obtener logs del sistema');
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/reboot
   */
  static async rebootRouter(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      await MikrotikManagerService.rebootSystem(nodeId);
      return res.json({
        success: true,
        message: 'Comando de reinicio enviado correctamente. El router se reiniciará ahora.'
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Reiniciar router MikroTik');
    }
  }

  /**
   * POST /api/nodes/:nodeId/mikrotik/backup
   */
  static async createBackupFile(req: Request, res: Response) {
    const { nodeId } = req.params;
    const { backupName } = req.body;
    
    // Generate a default name if not provided
    const nameToUse = backupName || `backup_JNSIX_${new Date().toISOString().slice(0,10).replace(/-/g, '')}`;

    try {
      const result = await MikrotikManagerService.createBackup(nodeId, nameToUse);
      return res.json({
        success: true,
        message: `Backup ${nameToUse}.backup generado exitosamente.`,
        data: result
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Generar copia de seguridad');
    }
  }

  /**
   * GET /api/nodes/:nodeId/mikrotik/system-resources
   */
  static async getSystemResources(req: Request, res: Response) {
    const { nodeId } = req.params;
    try {
      const data = await MikrotikManagerService.getSystemResources(nodeId);
      return res.json({
        success: true,
        data,
        log: {
          command: '/system/resource/print & /system/routerboard/print',
          friendlyMessage: 'Consulta de recursos y hardware del sistema completada.',
          timestamp: new Date().toISOString(),
          success: true
        }
      });
    } catch (err: any) {
      return MikrotikManagerController.handleError(res, err, 'Obtener recursos del sistema y Routerboard');
    }
  }
}
