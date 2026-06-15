import { Request, Response } from 'express';
import prisma from '../services/db.service';
import logger from '../utils/logger';
import { AuditService } from '../services/audit.service';
import { AuditEntity, AuditAction } from '@prisma/client';

export const getInventoryItems = async (req: Request, res: Response) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (error: any) {
    logger.error(`Error getting inventory items: ${error.message}`);
    res.status(500).json({ error: 'Error al obtener inventario.' });
  }
};

export const getInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado.' });
    res.json(item);
  } catch (error: any) {
    logger.error(`Error getting inventory item: ${error.message}`);
    res.status(500).json({ error: 'Error al obtener el ítem.' });
  }
};

export const createInventoryItem = async (req: Request, res: Response) => {
  try {
    const { name, type, status, serialNumber, macAddress, quantity, assignedTo, notes } = req.body;
    const newItem = await prisma.inventoryItem.create({
      data: {
        name,
        type,
        status,
        serialNumber: serialNumber || null,
        macAddress: macAddress || null,
        quantity: Number(quantity) || 1,
        assignedTo: assignedTo || null,
        notes,
      },
    });

    const user = (req as any).user;
    await AuditService.logAction({
      entity: AuditEntity.INVENTORY_ITEM,
      entityId: newItem.id,
      action: AuditAction.CREATE,
      description: `Ítem de inventario creado: ${newItem.name} (${newItem.serialNumber || 'Sin S/N'})`,
      userId: user?.id,
      userEmail: user?.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      dataAfter: newItem
    });

    res.status(201).json(newItem);
  } catch (error: any) {
    logger.error(`Error creating inventory item: ${error.message}`);
    res.status(500).json({ error: 'Error al crear ítem de inventario.' });
  }
};

export const updateInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, status, serialNumber, macAddress, quantity, assignedTo, notes } = req.body;
    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: {
        name,
        type,
        status,
        serialNumber: serialNumber || null,
        macAddress: macAddress || null,
        quantity: Number(quantity) || 1,
        assignedTo: assignedTo || null,
        notes,
      },
    });

    const user = (req as any).user;
    await AuditService.logAction({
      entity: AuditEntity.INVENTORY_ITEM,
      entityId: updatedItem.id,
      action: AuditAction.UPDATE,
      description: `Ítem de inventario actualizado: ${updatedItem.name}`,
      userId: user?.id,
      userEmail: user?.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      dataAfter: updatedItem
    });

    res.json(updatedItem);
  } catch (error: any) {
    logger.error(`Error updating inventory item: ${error.message}`);
    res.status(500).json({ error: 'Error al actualizar ítem.' });
  }
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    await prisma.inventoryItem.delete({
      where: { id },
    });

    const user = (req as any).user;
    await AuditService.logAction({
      entity: AuditEntity.INVENTORY_ITEM,
      entityId: id,
      action: AuditAction.DELETE,
      description: `Ítem de inventario eliminado: ${item?.name || id}`,
      userId: user?.id,
      userEmail: user?.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      dataBefore: item
    });

    res.json({ message: 'Ítem eliminado correctamente.' });
  } catch (error: any) {
    logger.error(`Error deleting inventory item: ${error.message}`);
    res.status(500).json({ error: 'Error al eliminar el ítem.' });
  }
};
