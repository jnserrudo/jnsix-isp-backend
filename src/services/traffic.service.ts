import prisma from './db.service';
import logger from '../utils/logger';
import { MikrotikService } from './mikrotik.service';

export class TrafficMonitorService {
  static async checkTrafficSaturation() {
    logger.info('Verificando tráfico en nodos para posibles saturaciones...');
    try {
      const nodes = await prisma.node.findMany({
        where: { isActive: true, trafficLimit: { not: null } }
      });

      for (const node of nodes) {
        if (!node.trafficLimit) continue;

        try {
          // En un sistema real harías una llamada a /interface/monitor-traffic
          // Para esta demostración, simularemos una carga aleatoria.
          const simulatedCurrentTraffic = Math.floor(Math.random() * (node.trafficLimit + 20)); // Simula tráfico entre 0 y Límite+20
          
          if (simulatedCurrentTraffic > node.trafficLimit) {
            logger.warn(`Saturación detectada en Nodo ${node.name}: ${simulatedCurrentTraffic} Mbps > ${node.trafficLimit} Mbps.`);
            
            // Creamos la notificación
            await prisma.notification.create({
              data: {
                title: 'Saturación de Red Detectada',
                message: `El nodo ${node.name} ha superado su límite de tráfico establecido. Consumo actual estimado: ${simulatedCurrentTraffic} Mbps (Límite: ${node.trafficLimit} Mbps).`,
                type: 'WARNING',
                isRead: false
              }
            });
          }
        } catch (error: any) {
          logger.error(`Error al revisar tráfico del nodo ${node.name}: ${error.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`Fallo general en TrafficMonitorService: ${err.message}`);
    }
  }
}
