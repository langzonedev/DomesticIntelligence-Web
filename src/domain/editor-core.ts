export type CheckStatus = 'pending' | 'pass' | 'fix';
export type Protocol = '' | 'Matter' | 'Thread' | 'Wi-Fi' | 'Ethernet' | 'Zigbee' | 'Z-Wave' | 'Bluetooth' | 'Other';

export interface AcceptanceCheck { name: string; status: CheckStatus }
export interface DevicePoint {
  id: string; roomId: string; x: number; y: number; name: string; category: string;
  brand: string; model: string; serialNumber: string; assetReference: string; protocol: Protocol;
  networkAddress: string; macAddress: string; networkLabel: string; controllerReference: string; portReference: string;
  installationDate: string; installerBusiness: string; circuitReference: string; physicalLocationNotes: string;
  warrantyDate: string; firmwareVersion: string; lastTestedDate: string; issuesActions: string;
  maintenanceNotes: string; homeownerNotes: string; installerNotes: string; checks: AcceptanceCheck[];
}
export interface Wall { id: string; x1: number; y1: number; x2: number; y2: number }
export interface MapViewport { x: number; y: number; zoom: number }
export interface MapCalibration { pixelsPerUnit: number; unit: string; sourcePixelDistance: number; sourceRealDistance: number }
export interface AtlasMap {
  width: number; height: number; gridSize: number; snapDistance: number; viewport: MapViewport;
  calibration: MapCalibration | null; walls: Wall[]; points: DevicePoint[];
  layers: Record<string, boolean>; layerLocks: Record<string, boolean>;
}
export interface AtlasState { schemaVersion: 3; workspaceMode: 'view' | 'edit'; view: 'commission' | 'handover'; map: AtlasMap }

export interface EditorCoreApi {
  readonly SCHEMA_VERSION: 3;
  normaliseState(value: unknown): AtlasState;
  migrateV6ToV7(value: unknown): AtlasState | null;
  setMapViewport(state: AtlasState, viewport: MapViewport): AtlasState;
  moveConnectedWallEndpoint(state: AtlasState, wallId: string, endpoint: 'start' | 'end', position: {x:number;y:number}, options?: Record<string, unknown>): AtlasState;
  calibrateMap(state: AtlasState, sourcePixelDistance: number, realDistance: number, unit?: string): AtlasState;
}

declare global { interface Window { DIEditorCore: EditorCoreApi } }
export const editorCore = (): EditorCoreApi => window.DIEditorCore;
