import { RouterOSAPI, Channel, Receiver } from 'node-routeros';
import logger from '../utils/logger';
import prisma from './db.service';

// Monkey patch node-routeros Channel class to prevent uncaught exceptions crashing the server
if (Channel && Channel.prototype) {
  (Channel.prototype as any)['onUnknown'] = function (reply: string) {
    logger.error(`[RouterOS Manager API Channel Warning] Unknown reply received: ${reply}`);
    this.emit('trap', new Error(`Tried to process unknown reply: ${reply}`));
  };
}

// Monkey patch node-routeros Receiver class to prevent uncaught exceptions on unregistered tags
if (Receiver && Receiver.prototype) {
  (Receiver.prototype as any)['sendTagData'] = function (currentTag: string) {
    const tag = this.tags.get(currentTag);
    if (tag) {
      tag.callback(this.currentPacket);
    } else {
      logger.warn(`[RouterOS Manager API Receiver Warning] Received data on unregistered tag: ${currentTag}`);
    }
    this.cleanUp();
  };
}

interface MikrotikCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface RouterOSCommandResult {
  command: string;
  args?: any;
  result: any;
  success: boolean;
  friendlyMessage: string;
  timestamp: string;
}

export class MikrotikManagerService {
  /**
   * Translates RouterOS native errors into friendly messages for the Administrator.
   */
  private static translateError(errorMsg: string): string {
    const msg = errorMsg.toLowerCase();
    if (msg.includes('already exists')) {
      return 'El recurso que intenta crear ya existe en el MikroTik (ej. usuario o IP duplicada).';
    }
    if (msg.includes('no such item')) {
      return 'El elemento que intenta modificar o eliminar no existe en el router.';
    }
    if (msg.includes('invalid user name or password')) {
      return 'Credenciales inválidas. El usuario o la contraseña configurados para el nodo son incorrectos.';
    }
    if (msg.includes('timed out') || msg.includes('etimedout')) {
      return 'Tiempo de espera agotado. El router MikroTik no responde. Verifique su conectividad y puerto API (8728).';
    }
    if (msg.includes('connection refused') || msg.includes('econnrefused')) {
      return 'Conexión rechazada. El servicio API no está habilitado en el puerto especificado en el MikroTik.';
    }
    if (msg.includes('failure:')) {
      return `Error de configuración MikroTik: ${errorMsg.split(/failure:\s*/i)[1] || errorMsg}`;
    }
    return `Error en RouterOS: ${errorMsg}`;
  }

  /**
   * Helper to execute API commands on a specific MikroTik Node with detailed feedback.
   */
  public static async runCommand(
    nodeId: string,
    command: string,
    args?: any,
    friendlyActionDesc: string = 'Ejecutando comando'
  ): Promise<RouterOSCommandResult> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      throw new Error(`Nodo con ID ${nodeId} no encontrado en la base de datos.`);
    }

    const credentials = {
      host: node.mikrotikHost,
      port: node.mikrotikPort,
      user: node.mikrotikUser,
      pass: node.mikrotikPassword,
    };

    const isMock =
      process.env.SIMULATE_MIKROTIK === 'true' ||
      credentials.host === '127.0.0.1' ||
      credentials.host === 'localhost' ||
      credentials.host.startsWith('192.168.');

    const timestamp = new Date().toISOString();

    if (isMock) {
      const mockResult = this.generateMockData(command, args, node);
      logger.info(`[SIMULACIÓN] Nodo: ${node.name} | Comando: ${command} | Args: ${JSON.stringify(args)}`);
      return {
        command,
        args,
        result: mockResult,
        success: true,
        friendlyMessage: `[SIMULADO] ${friendlyActionDesc} de forma exitosa en el nodo "${node.name}".`,
        timestamp,
      };
    }

    const conn = new RouterOSAPI({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.pass,
      timeout: 12,
    });

    // Registrar manejador de eventos de error para evitar que excepciones no controladas caigan en Node.js
    conn.on('error', (err: any) => {
      logger.error(`[RouterOS Manager API Event Error] en ${credentials.host}: ${err.message || err}`);
    });

    try {
      await conn.connect();
      const rawResult = args ? await conn.write(command, args) : await conn.write(command);
      await conn.close();

      return {
        command,
        args,
        result: rawResult,
        success: true,
        friendlyMessage: `${friendlyActionDesc} en el nodo "${node.name}".`,
        timestamp,
      };
    } catch (err: any) {
      try {
        await conn.close();
      } catch (e) {}

      const rawError = err.message || String(err);
      const translated = this.translateError(rawError);
      logger.error(`Error de MikroTik en Nodo ${node.name} (${command}): ${rawError}`);

      throw new Error(JSON.stringify({
        command,
        args,
        success: false,
        friendlyMessage: `Error al intentar: ${friendlyActionDesc.toLowerCase()}. Detalle: ${translated}`,
        rawError,
        timestamp,
      }));
    }
  }

  /**
   * Generates realistic mockup data for various RouterOS print & set commands.
   */
  private static generateMockData(command: string, args: any, node?: any): any {
    switch (command) {
      case '/interface/print':
        return [
          { '.id': '*1', name: 'ether1', type: 'ether', disabled: 'no', running: 'yes', mtu: '1500', 'actual-mtu': '1500', comment: 'Enlace WAN Principal' },
          { '.id': '*2', name: 'ether2', type: 'ether', disabled: 'no', running: 'yes', mtu: '1500', 'actual-mtu': '1500', comment: 'Distribución Clientes' },
          { '.id': '*3', name: 'ether3', type: 'ether', disabled: 'yes', running: 'no', mtu: '1500', 'actual-mtu': '1500', comment: 'Puerto de Respaldo' },
          { '.id': '*4', name: 'ether4', type: 'ether', disabled: 'no', running: 'no', mtu: '1500', 'actual-mtu': '1500', comment: 'Puerto Libre' },
          { '.id': '*5', name: 'wlan1', type: 'wlan', disabled: 'no', running: 'yes', mtu: '1500', 'actual-mtu': '1500', comment: 'AP Inalámbrico Local' },
        ];
      case '/interface/wireless/print':
        return [
          {
            '.id': '*5',
            name: 'wlan1',
            ssid: 'JNSIX_AP_NODO_PRUEBA',
            frequency: '2412',
            band: '2ghz-b/g/n',
            mode: 'ap-bridge',
            disabled: 'no',
            'radio-name': 'JNSIX-RouterOS-01',
            comment: 'Punto de Acceso Principal'
          }
        ];
      case '/interface/monitor-traffic':
        // Generate random traffic readings
        const isEther1 = args?.interface === 'ether1';
        return [{
          name: args?.interface || 'ether1',
          'rx-bits-per-second': isEther1 ? Math.floor(Math.random() * 80000000 + 20000000) : Math.floor(Math.random() * 50000000),
          'tx-bits-per-second': isEther1 ? Math.floor(Math.random() * 15000000 + 5000000) : Math.floor(Math.random() * 10000000),
          'rx-packets-per-second': Math.floor(Math.random() * 5000 + 200),
          'tx-packets-per-second': Math.floor(Math.random() * 3000 + 100),
        }];
      case '/ip/address/print':
        return [
          { '.id': '*1', address: '190.15.20.45/30', network: '190.15.20.44', interface: 'ether1', actualInterface: 'ether1', comment: 'IP WAN Pública' },
          { '.id': '*2', address: '10.100.0.1/24', network: '10.100.0.0', interface: 'ether2', actualInterface: 'ether2', comment: 'Subred Administración' },
          { '.id': '*3', address: '10.10.20.1/22', network: '10.10.20.0', interface: 'wlan1', actualInterface: 'wlan1', comment: 'Subred Clientes Inalámbricos' },
        ];
      case '/ip/dhcp-server/lease/print':
        return [
          { '.id': '*1', address: '10.100.0.50', 'mac-address': 'E4:8D:8C:11:AA:BB', 'host-name': 'Admin-PC', server: 'dhcp-admin', status: 'bound', expires: '10h 15m' },
          { '.id': '*2', address: '10.100.0.120', 'mac-address': '00:1A:11:BB:CC:DD', 'host-name': 'Notebook-Desarrollo', server: 'dhcp-admin', status: 'bound', expires: '23h 59m' },
          { '.id': '*3', address: '10.10.20.95', 'mac-address': 'BC:EE:7B:88:99:FF', 'host-name': 'Servidor-Backup', server: 'dhcp-wireless', status: 'bound', expires: '01h 05m' }
        ];
      case '/ip/arp/print':
        return [
          { '.id': '*1', address: '190.15.20.46', 'mac-address': 'D4:CA:6D:88:12:34', interface: 'ether1', published: 'no', invalid: 'no', DH: 'no', C: 'yes' },
          { '.id': '*2', address: '10.100.0.50', 'mac-address': 'E4:8D:8C:11:AA:BB', interface: 'ether2', published: 'no', invalid: 'no', DH: 'no', C: 'yes' },
          { '.id': '*3', address: '10.100.0.120', 'mac-address': '00:1A:11:BB:CC:DD', interface: 'ether2', published: 'no', invalid: 'no', DH: 'no', C: 'yes' }
        ];
      case '/ppp/secret/print':
        return [
          { '.id': '*1', name: 'juan.perez', password: 'juanpasspppoe', service: 'pppoe', profile: 'Plan-50M', remoteAddress: '10.50.0.12', comment: 'Contrato Juan Perez' },
          { '.id': '*2', name: 'maria.gomez', password: 'mariapasspppoe', service: 'pppoe', profile: 'Plan-100M', remoteAddress: '10.50.0.15', comment: 'Contrato Maria Gomez' },
          { '.id': '*3', name: 'carlos.lopez', password: 'carlospasspppoe', service: 'pppoe', profile: 'Plan-30M', remoteAddress: '10.50.0.21', comment: 'Contrato Carlos Lopez' }
        ];
      case '/ppp/active/print':
        return [
          { '.id': '*1', name: 'juan.perez', service: 'pppoe', callerId: '54:B8:0A:FF:FF:FF', address: '10.50.0.12', uptime: '1d 04h 12m' },
          { '.id': '*2', name: 'maria.gomez', service: 'pppoe', callerId: 'F4:F2:6D:AA:BB:CC', address: '10.50.0.15', uptime: '06h 44m' }
        ];
      case '/ppp/profile/print':
        return [
          { '.id': '*1', name: 'default', localAddress: '10.50.0.1', rateLimit: '10M/10M', dnsServer: '1.1.1.1' },
          { '.id': '*2', name: 'Plan-30M', localAddress: '10.50.0.1', rateLimit: '10M/30M', dnsServer: '8.8.8.8,1.1.1.1' },
          { '.id': '*3', name: 'Plan-50M', localAddress: '10.50.0.1', rateLimit: '15M/50M', dnsServer: '8.8.8.8,1.1.1.1' },
          { '.id': '*4', name: 'Plan-100M', localAddress: '10.50.0.1', rateLimit: '30M/100M', dnsServer: '8.8.8.8,1.1.1.1' }
        ];
      case '/queue/simple/print':
        return [
          { '.id': '*1', name: 'pppoe-juan.perez', target: '10.50.0.12/32', 'max-limit': '15000000/50000000', 'limit-at': '10000000/30000000', priority: '8/8', comment: 'Cola PPPoE Juan Perez' },
          { '.id': '*2', name: 'pppoe-maria.gomez', target: '10.50.0.15/32', 'max-limit': '30000000/100000000', 'limit-at': '20000000/70000000', priority: '6/6', comment: 'Cola PPPoE Maria Gomez' },
          { '.id': '*3', name: 'ip-10.100.0.50', target: '10.100.0.50/32', 'max-limit': '5000000/5000000', priority: '8/8', comment: 'Cola IP Estática Administrativa' }
        ];
      case '/ip/firewall/nat/print':
        return [
          { '.id': '*1', chain: 'srcnat', outInterface: 'ether1', action: 'masquerade', comment: 'NAT Enmascaramiento Salida WAN' },
          { '.id': '*2', chain: 'dstnat', protocol: 'tcp', dstPort: '8080', toAddresses: '10.100.0.10', toPorts: '80', action: 'dst-nat', comment: 'Redirección Servidor Web Interno' }
        ];
      case '/ip/firewall/filter/print':
        return [
          { '.id': '*1', chain: 'forward', srcAddressList: 'cortados', action: 'drop', disabled: 'no', comment: 'Bloqueo_JNSIX' },
          { '.id': '*2', chain: 'input', connectionState: 'invalid', action: 'drop', disabled: 'no', comment: 'Descartar Conexiones Inválidas' },
          { '.id': '*3', chain: 'input', protocol: 'icmp', action: 'accept', disabled: 'no', comment: 'Permitir ICMP (Ping)' }
        ];
      case '/ip/firewall/address-list/print':
        return [
          { '.id': '*1', list: 'cortados', address: '10.50.0.21', comment: 'Bloqueado por Mora - Carlos Lopez', disabled: 'no' }
        ];
      case '/ip/neighbor/print':
        return [
          { '.id': '*1', interface: 'ether2', 'mac-address': 'E4:8D:8C:11:AA:BB', identity: 'Torre-Secundaria', platform: 'MikroTik', board: 'RB4011iGS+', version: '7.12', unpack: 'none', age: '1w2d', 'ipv4-address': '190.15.20.45' },
          { '.id': '*2', interface: 'wlan1', 'mac-address': '00:1A:11:BB:CC:DD', identity: 'Enlace-PuntoPunto', platform: 'MikroTik', board: 'SXTsq 5 ac', version: '6.49.7', unpack: 'none', age: '3d5h' },
          { '.id': '*3', interface: 'ether1', 'mac-address': 'BC:EE:7B:88:99:FF', identity: 'Switch-Core', platform: 'MikroTik', board: 'CRS328-24P-4S+RM', version: '7.10', unpack: 'none', age: '5d12h', 'ipv4-address': '10.100.0.2' }
        ];
      case '/tool/romon/discover':
        return [
          { '.id': '*1', 'mac-address': 'E4:8D:8C:11:AA:BB', 'romon-id': 'e4:8d:8c:11:aa:bb', identity: 'Torre-Secundaria', hops: '1', path: 'E4:8D:8C:11:AA:BB' },
          { '.id': '*2', 'mac-address': '00:1A:11:BB:CC:DD', 'romon-id': '00:1a:11:bb:cc:dd', identity: 'Router-Vaqueros', hops: '2', path: 'E4:8D:8C:11:AA:BB,00:1A:11:BB:CC:DD' }
        ];
      case '/ping':
        return [
          { host: args?.address, size: '56', ttl: '64', time: `${Math.floor(Math.random() * 20)}ms`, 'sent': '1', 'received': '1', 'packet-loss': '0', status: 'OK' },
          { host: args?.address, size: '56', ttl: '64', time: `${Math.floor(Math.random() * 20)}ms`, 'sent': '2', 'received': '2', 'packet-loss': '0', status: 'OK' },
          { host: args?.address, size: '56', ttl: '64', time: `${Math.floor(Math.random() * 20)}ms`, 'sent': '3', 'received': '3', 'packet-loss': '0', status: 'OK' }
        ];
      case '/log/print':
        return [
          { '.id': '*1', time: '10:05:12', topics: 'system,info', message: 'router rebooted' },
          { '.id': '*2', time: '10:15:30', topics: 'pppoe,info', message: 'juan.perez logged in' },
          { '.id': '*3', time: '11:20:00', topics: 'error,critical', message: 'login failure for user admin from 192.168.1.5' },
          { '.id': '*4', time: '12:00:45', topics: 'interface,info', message: 'ether1 link up' }
        ];
      case '/system/resource/print':
        const isRB5009 = node?.name?.toLowerCase().includes('5009') || node?.name?.toLowerCase().includes('central');
        return [
          {
            uptime: '5w2d14h30m',
            version: '7.12.1 (Stable)',
            'build-time': 'Nov/20/2023 12:45:10',
            'factory-software': '6.48.3',
            'free-memory': isRB5009 ? '814549376' : '184549376',
            'total-memory': isRB5009 ? '1073741824' : '268435456',
            cpu: isRB5009 ? 'ARM64' : 'MIPS',
            'cpu-count': isRB5009 ? '4' : '1',
            'cpu-frequency': isRB5009 ? '1400MHz' : '650MHz',
            'cpu-load': '12',
            'free-hdd-space': '42106880',
            'total-hdd-space': '67108864',
            'architecture-name': isRB5009 ? 'arm64' : 'mipsbe',
            'board-name': isRB5009 ? 'RB5009UG+S+' : 'hAP ac lite',
            platform: 'MikroTik'
          }
        ];
      case '/system/routerboard/print':
        const isRB5009_2 = node?.name?.toLowerCase().includes('5009') || node?.name?.toLowerCase().includes('central');
        return [
          {
            routerboard: 'yes',
            model: isRB5009_2 ? 'RB5009UG+S+IN' : 'RB952Ui-5ac2nD',
            'serial-number': isRB5009_2 ? 'HE909ABCDEF' : 'HC809ABCDEF',
            'current-firmware': '7.12.1',
            'upgrade-firmware': '7.12.1'
          }
        ];
      case '/system/identity/print':
        const cleanName = node?.name
          ? node.name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
          : 'RouterOS';
        return [
          { name: `${cleanName}-Core` }
        ];
      case '/system/reboot':
        return [];
      case '/system/backup/save':
        return { message: 'Configuration backup saved' };
      default:
        // Generic success responses for set/add/remove operations
        if (command.includes('/set')) {
          return { status: 'success', message: 'Configuración guardada.' };
        }
        if (command.includes('/add')) {
          return { '.id': `*new-${Math.floor(Math.random() * 1000)}`, status: 'success', message: 'Elemento añadido.' };
        }
        if (command.includes('/remove')) {
          return { status: 'success', message: 'Elemento removido.' };
        }
        return { message: 'Operación simulada completada exitosamente.' };
    }
  }

  // --- BUSINESS LOGIC METHODS ---

  /**
   * List all physical and wireless interfaces
   */
  static async getInterfaces(nodeId: string): Promise<{
    interfaces: any[];
    wireless: any[];
  }> {
    const interfacesResult = await this.runCommand(
      nodeId,
      '/interface/print',
      undefined,
      'Listando interfaces de red'
    );

    const interfaces = interfacesResult.result || [];
    const hasWireless = Array.isArray(interfaces) && interfaces.some((iface: any) => 
      iface.type === 'wlan' || 
      iface.type === 'wireless' || 
      iface.type === 'w60g'
    );

    let wirelessResult: any = [];
    if (hasWireless) {
      try {
        // Fetch wireless interfaces, catch error in case the router has no wireless cards
        const res = await this.runCommand(
          nodeId,
          '/interface/wireless/print',
          undefined,
          'Consultando interfaces inalámbricas wlan'
        );
        wirelessResult = res.result || [];
      } catch (e) {
        logger.warn(`No se pudieron listar interfaces inalámbricas wlan en el nodo ${nodeId}: ${e}`);
      }
    } else {
      logger.info(`[Manager] El router del nodo ${nodeId} no posee interfaces wireless. Omitiendo.`);
    }

    return {
      interfaces,
      wireless: Array.isArray(wirelessResult) ? wirelessResult : [],
    };
  }

  /**
   * Enable or disable an interface
   */
  static async setInterfaceState(
    nodeId: string,
    name: string,
    disabled: boolean
  ): Promise<RouterOSCommandResult> {
    const actionDesc = disabled
      ? `Deshabilitando interfaz ${name}`
      : `Habilitando interfaz ${name}`;

    return await this.runCommand(
      nodeId,
      '/interface/set',
      {
        numbers: name,
        disabled: disabled ? 'yes' : 'no',
      },
      actionDesc
    );
  }

  /**
   * Configure wireless interface settings (SSID, Band, Frequency, etc.)
   */
  static async configureWireless(
    nodeId: string,
    name: string,
    ssid: string,
    frequency?: string,
    disabled?: boolean
  ): Promise<RouterOSCommandResult> {
    const args: any = {
      numbers: name,
      ssid,
    };
    if (frequency) {
      args.frequency = frequency;
    }
    if (disabled !== undefined) {
      args.disabled = disabled ? 'yes' : 'no';
    }

    return await this.runCommand(
      nodeId,
      '/interface/wireless/set',
      args,
      `Configurando parámetros inalámbricos AP en ${name}`
    );
  }

  /**
   * Monitor real-time traffic on a specific interface
   */
  static async monitorInterfaceTraffic(
    nodeId: string,
    interfaceName: string
  ): Promise<RouterOSCommandResult> {
    return await this.runCommand(
      nodeId,
      '/interface/monitor-traffic',
      {
        interface: interfaceName,
        once: 'yes',
      },
      `Monitoreando tráfico en tiempo real de la interfaz ${interfaceName}`
    );
  }

  /**
   * General command exec for modular expandability of other menus
   */
  static async getIpDhcpData(nodeId: string): Promise<{
    addresses: any[];
    leases: any[];
    arp: any[];
  }> {
    const addresses = await this.runCommand(nodeId, '/ip/address/print', undefined, 'Obteniendo asignaciones de direcciones IP').catch((err) => {
      logger.warn(`No se pudieron obtener asignaciones de direcciones IP del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });
    const leases = await this.runCommand(nodeId, '/ip/dhcp-server/lease/print', undefined, 'Listando alquileres de IP (DHCP Leases)').catch((err) => {
      logger.warn(`No se pudieron obtener DHCP Leases del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });
    const arp = await this.runCommand(nodeId, '/ip/arp/print', undefined, 'Obteniendo tabla de traducción ARP').catch((err) => {
      logger.warn(`No se pudo obtener tabla ARP del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });

    return {
      addresses: addresses.result || [],
      leases: leases.result || [],
      arp: arp.result || [],
    };
  }

  static async getPppData(nodeId: string): Promise<{
    secrets: any[];
    active: any[];
    profiles: any[];
  }> {
    const secrets = await this.runCommand(nodeId, '/ppp/secret/print', undefined, 'Listando secretos PPPoE').catch((err) => {
      logger.warn(`No se pudieron extraer secretos PPPoE del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });
    const active = await this.runCommand(nodeId, '/ppp/active/print', undefined, 'Listando sesiones PPPoE activas').catch((err) => {
      logger.warn(`No se pudieron extraer sesiones PPPoE activas del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });
    const profiles = await this.runCommand(nodeId, '/ppp/profile/print', undefined, 'Obteniendo perfiles de servicio PPPoE').catch((err) => {
      logger.warn(`No se pudieron obtener perfiles PPPoE del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });

    return {
      secrets: secrets.result || [],
      active: active.result || [],
      profiles: profiles.result || [],
    };
  }

  static async getQueues(nodeId: string): Promise<any[]> {
    const res = await this.runCommand(nodeId, '/queue/simple/print', undefined, 'Obteniendo colas simples de velocidad (Queues)');
    return res.result || [];
  }

  static async getFirewallData(nodeId: string): Promise<{
    nat: any[];
    filter: any[];
    addressList: any[];
  }> {
    const nat = await this.runCommand(nodeId, '/ip/firewall/nat/print', undefined, 'Consultando reglas de traducción NAT');
    const filter = await this.runCommand(nodeId, '/ip/firewall/filter/print', undefined, 'Listando reglas de filtro del Firewall (Cortes)');
    const addressList = await this.runCommand(nodeId, '/ip/firewall/address-list/print', undefined, 'Obteniendo listas de direcciones (Address Lists)');

    return {
      nat: nat.result || [],
      filter: filter.result || [],
      addressList: addressList.result || [],
    };
  }

  /**
   * Discover associated network devices using MNDP (Neighbors)
   */
  static async discoverNetwork(nodeId: string): Promise<{
    neighbors: any[];
    romon: any[];
  }> {
    const neighbors = await this.runCommand(
      nodeId, 
      '/ip/neighbor/print', 
      undefined, 
      'Escaneando nodos vecinos (MNDP)'
    ).catch((err) => {
      logger.warn(`No se pudieron obtener los vecinos del nodo ${nodeId}: ${err.message || err}`);
      return { result: [] };
    });

    return {
      neighbors: neighbors.result || [],
      romon: [], // RoMON discover removed as it hangs the API
    };
  }

  /**
   * Execute ping command from the router to any IP
   */
  static async ping(nodeId: string, address: string, count: number = 4): Promise<any[]> {
    const response = await this.runCommand(
      nodeId,
      '/ping',
      {
        address,
        count: count.toString()
      },
      `Ejecutando diagnóstico Ping hacia ${address}`
    );
    return response.result || [];
  }

  /**
   * Fetch system logs
   */
  static async getLogs(nodeId: string): Promise<any[]> {
    const response = await this.runCommand(
      nodeId,
      '/log/print',
      undefined,
      'Extrayendo registros del sistema (Logs)'
    );
    return response.result || [];
  }

  /**
   * Reboot the MikroTik router
   */
  static async rebootSystem(nodeId: string): Promise<boolean> {
    try {
      await this.runCommand(
        nodeId,
        '/system/reboot',
        undefined,
        'Reiniciando router MikroTik'
      );
      // MikroTik cuts the connection during reboot, so we might get an error or a disconnect.
      return true;
    } catch (e: any) {
      // If the error is a timeout or connection closed, it's expected during reboot.
      const msg = String(e).toLowerCase();
      if (msg.includes('timeout') || msg.includes('closed') || msg.includes('eof')) {
        return true;
      }
      throw e;
    }
  }

  /**
   * Create a system backup file (.backup)
   */
  static async createBackup(nodeId: string, backupName: string): Promise<RouterOSCommandResult> {
    return await this.runCommand(
      nodeId,
      '/system/backup/save',
      { name: backupName },
      `Generando copia de seguridad: ${backupName}.backup`
    );
  }

  /**
   * Fetch system resources, hardware info and identity
   */
  static async getSystemResources(nodeId: string): Promise<{
    resource: any;
    routerboard: any;
    identity: any;
  }> {
    const resourceResult = await this.runCommand(
      nodeId,
      '/system/resource/print',
      undefined,
      'Obteniendo recursos del sistema'
    ).catch((err) => {
      logger.warn(`No se pudieron obtener recursos del sistema para el nodo ${nodeId}: ${err.message || err}`);
      return { result: [{}] };
    });

    const routerboardResult = await this.runCommand(
      nodeId,
      '/system/routerboard/print',
      undefined,
      'Obteniendo información del Routerboard'
    ).catch((err) => {
      logger.warn(`No se pudo obtener información del Routerboard para el nodo ${nodeId}: ${err.message || err}`);
      return { result: [{}] };
    });

    const identityResult = await this.runCommand(
      nodeId,
      '/system/identity/print',
      undefined,
      'Obteniendo identidad del sistema'
    ).catch((err) => {
      logger.warn(`No se pudo obtener identidad del sistema para el nodo ${nodeId}: ${err.message || err}`);
      return { result: [{ name: 'MikroTik' }] };
    });

    return {
      resource: resourceResult.result?.[0] || {},
      routerboard: routerboardResult.result?.[0] || {},
      identity: identityResult.result?.[0] || { name: 'MikroTik' },
    };
  }
}
