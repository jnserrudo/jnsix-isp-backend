import fs from 'fs';
import path from 'path';
import prisma from './db.service';
import { MikrotikManagerService } from './mikrotik-manager.service';
import logger from '../utils/logger';
import { AuditService } from './audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

interface ExcelClient {
  "Nombre y Apellido": string;
  "Dirección / Zona": string;
  "Teléfono"?: string;
  "Plan": string;
  "Monto"?: number;
  "febrero"?: string;
  "marzo"?: string;
  "Aril"?: string; // Note: spelling in Excel
  "Mayo"?: string;
  "Junio"?: string;
  "Julio"?: string;
}

interface MigrationMappingInput {
  fullName: string;
  dni: string;
  phone?: string;
  address: string;
  planId: string;
  connectionMode: 'PPPoE' | 'StaticIP';
  pppoeUsername?: string;
  pppoePassword?: string;
  staticIp?: string;
  macAddress?: string;
  onuSerial?: string;
  onuModel?: string;
  status: 'ACTIVE' | 'DELINQUENT';
  monto?: number;
  suggestedMatch?: any;
}

export class MigrationService {
  /**
   * Helper function for Levenshtein Distance
   */
  private static getLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Calculates similarity percentage between 0 and 1
   */
  private static getSimilarity(s1: string, s2: string): number {
    const clean1 = s1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const clean2 = s2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    if (clean1 === clean2) return 1.0;
    const maxLen = Math.max(clean1.length, clean2.length);
    if (maxLen === 0) return 1.0;
    
    const dist = this.getLevenshteinDistance(clean1, clean2);
    return 1.0 - dist / maxLen;
  }

  /**
   * Analyzes the Excel data and returns matches with MikroTik secrets/leases
   */
  public static async analyzeMigration(nodeId: string): Promise<any> {
    const jsonPath = path.join(__dirname, '../../VAQUEROS.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`El archivo de datos VAQUEROS.json no existe en el servidor en la ruta: ${jsonPath}.`);
    }

    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const excelClients: ExcelClient[] = JSON.parse(rawData);

    // Get MikroTik data
    let pppSecrets: any[] = [];
    let dhcpLeases: any[] = [];
    
    try {
      const pppData = await MikrotikManagerService.getPppData(nodeId);
      pppSecrets = pppData.secrets || [];
    } catch (e) {
      logger.warn(`No se pudieron extraer los secretos PPPoE del router para migración: ${e}`);
    }

    try {
      const dhcpData = await MikrotikManagerService.getIpDhcpData(nodeId);
      dhcpLeases = dhcpData.leases || [];
    } catch (e) {
      logger.warn(`No se pudieron extraer los DHCP leases del router para migración: ${e}`);
    }

    // Get registered plans to map
    const dbPlans = await prisma.plan.findMany({ where: { isActive: true } });

    const analyzedList = excelClients.map((client, index) => {
      const name = client["Nombre y Apellido"] || "";
      const address = client["Dirección / Zona"] || "";
      const phone = client["Teléfono"] ? String(client["Teléfono"]) : "";
      const planStr = client["Plan"] || "";
      const price = client["Monto"] || 0;
      
      // Determine payment status based on history
      // If any of the months is PENDIENTE or suspendido, mark status as DELINQUENT
      let status: 'ACTIVE' | 'DELINQUENT' = 'ACTIVE';
      const feb = client.febrero?.toLowerCase() || '';
      const mar = client.marzo?.toLowerCase() || '';
      const ari = client.Aril?.toLowerCase() || '';
      const may = client.Mayo?.toLowerCase() || '';
      if (feb.includes('pend') || feb.includes('susp') || 
          mar.includes('pend') || mar.includes('susp') ||
          ari.includes('pend') || ari.includes('susp') ||
          may.includes('pend') || may.includes('susp')) {
        status = 'DELINQUENT';
      }

      // Generate a temporary unique DNI
      const tempDni = `TEMP-${phone ? phone : '9' + String(Math.floor(10000000 + Math.random() * 90000000))}`;

      // Find best match in PPPoE Secrets
      let bestPppMatch: any = null;
      let pppConfidence = 0;
      for (const secret of pppSecrets) {
        const secretName = secret.name || "";
        const secretComment = secret.comment || "";
        
        const simName = this.getSimilarity(name, secretName);
        const simComment = this.getSimilarity(name, secretComment);
        const maxSim = Math.max(simName, simComment);
        
        if (maxSim > pppConfidence) {
          pppConfidence = maxSim;
          bestPppMatch = secret;
        }
      }

      // Find best match in DHCP Leases
      let bestDhcpMatch: any = null;
      let dhcpConfidence = 0;
      for (const lease of dhcpLeases) {
        const leaseHost = lease["host-name"] || "";
        const leaseComment = lease.comment || "";
        
        const simHost = this.getSimilarity(name, leaseHost);
        const simComment = this.getSimilarity(name, leaseComment);
        const maxSim = Math.max(simHost, simComment);
        
        if (maxSim > dhcpConfidence) {
          dhcpConfidence = maxSim;
          bestDhcpMatch = lease;
        }
      }

      // Determine the overall best match
      let suggestedMatch: any = null;
      if (pppConfidence >= dhcpConfidence && pppConfidence > 0.65) {
        suggestedMatch = {
          type: 'PPPoE',
          name: bestPppMatch.name,
          comment: bestPppMatch.comment,
          confidence: Math.round(pppConfidence * 100),
          details: bestPppMatch
        };
      } else if (dhcpConfidence > pppConfidence && dhcpConfidence > 0.65) {
        suggestedMatch = {
          type: 'StaticIP',
          name: bestDhcpMatch.address,
          comment: bestDhcpMatch.comment,
          confidence: Math.round(dhcpConfidence * 100),
          details: bestDhcpMatch
        };
      }

      // Find best matching DB Plan
      let suggestedPlanId = "";
      let planConfidence = 0;
      for (const dbPlan of dbPlans) {
        const simPlan = this.getSimilarity(planStr, dbPlan.name);
        if (simPlan > planConfidence) {
          planConfidence = simPlan;
          suggestedPlanId = dbPlan.id;
        }
      }
      // Fallback: if no plan match, pick the first active plan
      if (!suggestedPlanId && dbPlans.length > 0) {
        suggestedPlanId = dbPlans[0].id;
      }

      return {
        id: index,
        fullName: name,
        address,
        phone,
        planStr,
        price,
        status,
        tempDni,
        paymentHistory: {
          febrero: client.febrero || null,
          marzo: client.marzo || null,
          abril: client.Aril || null,
          mayo: client.Mayo || null
        },
        suggestedPlanId,
        suggestedMatch
      };
    });

    return {
      success: true,
      clients: analyzedList,
      availablePlans: dbPlans,
      mikrotikSummary: {
        secretsCount: pppSecrets.length,
        leasesCount: dhcpLeases.length
      }
    };
  }

  /**
   * Executes bulk database import from reconciled inputs
   */
  public static async executeMigration(
    nodeId: string,
    mappings: MigrationMappingInput[],
    userId: string
  ): Promise<any> {
    let importedCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    // Loop through each mapping record and import inside separate database writes
    for (const item of mappings) {
      try {
        await prisma.$transaction(async (tx) => {
          // Check if Client already exists by DNI
          let client = await tx.client.findUnique({
            where: { dni: item.dni }
          });

          if (!client) {
            let notesText = 'Importado automáticamente mediante Asistente de Migración.';
            if (item.suggestedMatch) {
              notesText = `[MIGRATION_METADATA]${JSON.stringify({
                matched: true,
                type: item.suggestedMatch.type,
                name: item.suggestedMatch.name,
                comment: item.suggestedMatch.comment,
                confidence: item.suggestedMatch.confidence
              })}[MIGRATION_METADATA]${notesText}`;
            } else {
              notesText = `[MIGRATION_METADATA]${JSON.stringify({
                matched: false,
                confidence: 0
              })}[MIGRATION_METADATA]${notesText}`;
            }

            // Create Client
            client = await tx.client.create({
              data: {
                fullName: item.fullName,
                dni: item.dni,
                phone1: item.phone || null,
                address: item.address,
                status: item.status === 'DELINQUENT' ? 'DELINQUENT' : 'ACTIVE',
                notes: notesText
              }
            });
          }

          // Create ServiceContract
          const contract = await tx.serviceContract.create({
            data: {
              clientId: client.id,
              planId: item.planId,
              nodeId: nodeId,
              billingDay: 5,
              graceDays: 5,
              status: 'ACTIVE', // All contracts start as ACTIVE. Overdue invoices will flag them for manual suspension if needed.
              pppoeUsername: item.connectionMode === 'PPPoE' ? item.pppoeUsername || null : null,
              pppoePassword: item.connectionMode === 'PPPoE' ? item.pppoePassword || null : null,
              staticIp: item.connectionMode === 'StaticIP' ? item.staticIp || null : null,
              macAddress: item.connectionMode === 'StaticIP' ? item.macAddress || null : null,
              onuSerial: item.onuSerial || null,
              onuModel: item.onuModel || null,
              contractStart: new Date()
            }
          });

          // Create pending invoice if client is delinquent/overdue
          if (item.status === 'DELINQUENT') {
            const invoiceNumber = `MIG-FAC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
            await tx.invoice.create({
              data: {
                contractId: contract.id,
                clientId: client.id,
                invoiceNumber,
                periodStart: new Date(2026, 4, 1), // May
                periodEnd: new Date(2026, 4, 31),
                amount: item.monto || 20000,
                status: 'OVERDUE',
                dueDate: new Date(2026, 5, 5), // June 5
                notes: 'Factura vencida migrada del historial de Excel.'
              }
            });
          }
        });
        
        importedCount++;
      } catch (err: any) {
        errorCount++;
        errors.push({
          clientName: item.fullName,
          error: err.message || String(err)
        });
        logger.error(`Error migrando cliente ${item.fullName}: ${err.message || err}`);
      }
    }

    // Write audit log
      try {
        await AuditService.logAction({
          entity: AuditEntity.IMPORT,
          action: AuditAction.IMPORT_EXCEL,
          description: `Migración masiva completada. Exitosos: ${importedCount}, Errores: ${errorCount}. Nodo: ${nodeId}`,
          userId: userId,
          success: errorCount === 0,
          errorMessage: errorCount > 0 ? `Errores en ${errorCount} filas.` : undefined,
          dataAfter: { importedCount, errorCount, errors }
        });
      } catch (e) {
      logger.error('Error escribiendo log de auditoría de importación:', e);
    }

    return {
      success: true,
      importedCount,
      errorCount,
      errors
    };
  }

  /**
   * Cleans up (deletes) all migrated clients and their contracts/invoices/payments for a given nodeId.
   */
  public static async cleanupNodeMigration(nodeId: string, userId: string): Promise<any> {
    // 1. Find all contracts linked to the node
    const contracts = await prisma.serviceContract.findMany({
      where: { nodeId },
      select: { clientId: true }
    });

    const clientIds = [...new Set(contracts.map(c => c.clientId))];

    if (clientIds.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No se encontraron clientes asociados a este nodo.'
      };
    }

    // 2. Delete the clients (cascade delete handles serviceContract, invoice, payment, mikrotikAction)
    const deleted = await prisma.client.deleteMany({
      where: { id: { in: clientIds } }
    });

    // 3. Write audit log
      try {
        await AuditService.logAction({
          entity: AuditEntity.IMPORT,
          action: AuditAction.DELETE,
          description: `Limpieza de migración completada. Clientes eliminados: ${deleted.count}. Nodo: ${nodeId}`,
          userId,
          success: true
        });
      } catch (e) {
      logger.error('Error escribiendo log de auditoría de limpieza:', e);
    }

    return {
      success: true,
      deletedCount: deleted.count,
      message: `Se eliminaron correctamente ${deleted.count} clientes y toda su información relacionada.`
    };
  }
}
