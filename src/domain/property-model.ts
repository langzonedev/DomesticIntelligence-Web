import type { AtlasMap, AtlasState, DevicePoint } from './editor-core.js';

export interface Storey { id: string; name: string; map: AtlasMap }
export interface PropertyState extends AtlasState { home: { id: string; name: string; address: string; activeFloorId: string; floors: Storey[] } }
export interface PropertyDevice extends DevicePoint { floorId: string; floorName: string; roomName: string }
export interface PropertyReadiness { status: 'attention' | 'pending' | 'ready'; devices: number; readyDevices: number; totalChecks: number; passedChecks: number; attentionChecks: number }

export interface PropertyModelApi {
  normalisePropertyState(state: unknown, options?: {loadActiveFloor?: boolean}): PropertyState;
  syncActiveFloor(state: PropertyState): PropertyState;
  activateFloor(state: PropertyState, floorId: string): PropertyState;
  getPropertyDevices(state: PropertyState): PropertyDevice[];
  getPropertyReadiness(state: PropertyState): PropertyReadiness;
  toExportShape(state: PropertyState): unknown;
}

declare global { interface Window { DIPropertyModel: PropertyModelApi } }
export const propertyModel = (): PropertyModelApi => window.DIPropertyModel;
