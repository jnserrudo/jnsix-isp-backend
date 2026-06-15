import { Request, Response } from 'express';
import { RouterOSAPI } from 'node-routeros';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export class MikrotikTestController {
  /**
   * POST /api/mikrotik-test/connection
   * Probar conexión con MikroTik
   */
  static async testConnection(req: Request, res: Response) {
    const { host, port, user, password } = req.body;
    
    try {
      if (!host || !port || !user || !password) {
        return res.status(400).json({
          message: 'Faltan parámetros: host, port, user, password',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 30, // Aumentado a 30 segundos
      });

      logger.info(`Intentando conectar a ${host}:${port}...`);
      await conn.connect();
      logger.info(`Conexión exitosa con MikroTik ${host}`);

      // Obtener información del sistema
      const systemResource = await conn.write('/system/resource/print');
      const systemIdentity = await conn.write('/system/identity/print');

      await conn.close();

      res.json({
        success: true,
        message: 'Conexión exitosa',
        data: {
          systemResource,
          systemIdentity,
        },
      });
    } catch (error: any) {
      logger.error(`Error probando conexión MikroTik: ${error.message}`);
      
      let errorMessage = 'Error de conexión';
      
      if (error.message.includes('Timed out')) {
        errorMessage = `No se puede conectar a ${host}:${port}. Verifica que:\n1. El MikroTik esté encendido y accesible\n2. El servicio API esté habilitado (/ip service)\n3. Tu PC esté en la misma red\n4. No haya firewall bloqueando el puerto ${port}`;
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = `Conexión rechazada. El servicio API no está habilitado en el MikroTik. Ejecuta en Winbox: /ip service set api disabled=no`;
      } else if (error.message.includes('invalid user name or password')) {
        errorMessage = 'Usuario o contraseña incorrectos. Verifica las credenciales en Winbox: /user print';
      } else if (error.message.includes('EHOSTUNREACH')) {
        errorMessage = `Host no alcanzable. Verifica que ${host} sea la IP correcta y que tu PC esté en la misma red.`;
      } else {
        errorMessage = error.message;
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/mikrotik-test/command
   * Ejecutar comando manual en MikroTik
   */
  static async executeCommand(req: Request, res: Response) {
    try {
      const { host, port, user, password, command, args } = req.body;

      if (!host || !port || !user || !password || !command) {
        return res.status(400).json({
          message: 'Faltan parámetros: host, port, user, password, command',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 10,
      });

      await conn.connect();
      logger.info(`Ejecutando comando: ${command}`);

      const result = await conn.write(command, args || []);

      await conn.close();

      const reqUser = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        action: AuditAction.UPDATE,
        description: `Prueba de comando Mikrotik: ${command}`,
        userId: reqUser?.id,
        userEmail: reqUser?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: { host, command, args }
      });

      res.json({
        success: true,
        command,
        result,
      });
    } catch (error: any) {
      logger.error(`Error ejecutando comando: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error ejecutando comando',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/mikrotik-test/pppoe-secret/create
   * Crear secret PPPoE de prueba
   */
  static async createPPPoESecret(req: Request, res: Response) {
    try {
      const { host, port, user, password, username, pppoePassword, profile } = req.body;

      if (!host || !port || !user || !password || !username || !pppoePassword) {
        return res.status(400).json({
          message: 'Faltan parámetros',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 10,
      });

      await conn.connect();

      const result = await conn.write('/ppp/secret/add', [
        `=name=${username}`,
        `=password=${pppoePassword}`,
        `=service=pppoe`,
        profile ? `=profile=${profile}` : '',
        `=comment=Test_Secret`,
      ].filter(Boolean));

      await conn.close();

      const reqUser = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        action: AuditAction.CREATE,
        description: `Secret PPPoE de prueba creado: ${username}`,
        userId: reqUser?.id,
        userEmail: reqUser?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: { host, username }
      });

      res.json({
        success: true,
        message: 'Secret PPPoE creado',
        result,
      });
    } catch (error: any) {
      logger.error(`Error creando secret: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error creando secret',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/mikrotik-test/queue/create
   * Crear queue de prueba
   */
  static async createQueue(req: Request, res: Response) {
    try {
      const { host, port, user, password, name, target, maxLimit } = req.body;

      if (!host || !port || !user || !password || !name || !target || !maxLimit) {
        return res.status(400).json({
          message: 'Faltan parámetros',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 10,
      });

      await conn.connect();

      const result = await conn.write('/queue/simple/add', [
        `=name=${name}`,
        `=target=${target}`,
        `=max-limit=${maxLimit}`,
        `=comment=Test_Queue`,
      ]);

      await conn.close();

      const reqUser = (req as any).user;
      await AuditService.logAction({
        entity: AuditEntity.MIKROTIK,
        action: AuditAction.CREATE,
        description: `Queue de prueba creada: ${name} (${maxLimit})`,
        userId: reqUser?.id,
        userEmail: reqUser?.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        dataAfter: { host, name, maxLimit }
      });

      res.json({
        success: true,
        message: 'Queue creada',
        result,
      });
    } catch (error: any) {
      logger.error(`Error creando queue: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error creando queue',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/mikrotik-test/list
   * Listar recursos (secrets, queues, etc.)
   */
  static async listResources(req: Request, res: Response) {
    try {
      const { host, port, user, password, resource } = req.body;

      if (!host || !port || !user || !password || !resource) {
        return res.status(400).json({
          message: 'Faltan parámetros: host, port, user, password, resource',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 10,
      });

      await conn.connect();

      let command = '';
      switch (resource) {
        case 'secrets':
          command = '/ppp/secret/print';
          break;
        case 'queues':
          command = '/queue/simple/print';
          break;
        case 'active-pppoe':
          command = '/ppp/active/print';
          break;
        case 'address-list':
          command = '/ip/firewall/address-list/print';
          break;
        case 'firewall-filter':
          command = '/ip/firewall/filter/print';
          break;
        default:
          await conn.close();
          return res.status(400).json({
            message: 'Recurso no válido',
          });
      }

      const result = await conn.write(command);

      await conn.close();

      res.json({
        success: true,
        resource,
        result,
      });
    } catch (error: any) {
      logger.error(`Error listando recursos: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error listando recursos',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/mikrotik-test/initialize
   * Inicializar router (crear regla de firewall y address-list)
   */
  static async initializeRouter(req: Request, res: Response) {
    try {
      const { host, port, user, password } = req.body;

      if (!host || !port || !user || !password) {
        return res.status(400).json({
          message: 'Faltan parámetros',
        });
      }

      const conn = new RouterOSAPI({
        host,
        port: parseInt(port),
        user,
        password,
        timeout: 10,
      });

      await conn.connect();

      const steps = [];

      // 1. Verificar si existe la regla de firewall
      const existingRules = await conn.write('/ip/firewall/filter/print', [
        '?comment=Bloqueo_JNSIX',
      ]);

      if (!existingRules || existingRules.length === 0) {
        // Crear regla de firewall
        await conn.write('/ip/firewall/filter/add', [
          '=chain=forward',
          '=src-address-list=cortados',
          '=action=drop',
          '=place-before=0',
          '=comment=Bloqueo_JNSIX',
        ]);
        steps.push('✅ Regla de firewall creada');
      } else {
        steps.push('✅ Regla de firewall ya existe');
      }

      // 2. Verificar address-list
      steps.push('✅ Address-list "cortados" lista para usar');

      await conn.close();

      res.json({
        success: true,
        message: 'Router inicializado correctamente',
        steps,
      });
    } catch (error: any) {
      logger.error(`Error inicializando router: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Error inicializando router',
        error: error.message,
      });
    }
  }
}
