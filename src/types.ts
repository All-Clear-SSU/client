// src/types.ts

export interface CCTVConfig {
    location: string;
    streamUrl: string;
}

export interface CSIConfig {
    location: string;
    topic: string;
}

export interface BuildingConfig {
    id: string;
    name: string;
    cctvs: CCTVConfig[];
    csis: CSIConfig[];
}