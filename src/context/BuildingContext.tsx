import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useState,
} from "react";

export type BuildingConfig = {
    id: string;
    name: string;
    cctvs: { location: string; streamUrl: string }[];
    csis: { location: string; topic: string }[];
};

type BuildingContextType = {
  buildings: BuildingConfig[];
  setBuildings: Dispatch<SetStateAction<BuildingConfig[]>>;
  selectedBuilding: BuildingConfig | null;
  setSelectedBuilding: Dispatch<SetStateAction<BuildingConfig | null>>;
};

const BuildingContext = createContext<BuildingContextType | null>(null);

export const BuildingProvider = ({ children }: { children: ReactNode }) => {
  const [buildings, setBuildings] = useState<BuildingConfig[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingConfig | null>(null);

  return (
    <BuildingContext.Provider
      value={{ buildings, setBuildings, selectedBuilding, setSelectedBuilding }}
    >
      {children}
    </BuildingContext.Provider>
  );
};

export const useBuilding = () => {
  const ctx = useContext(BuildingContext);
  if (!ctx) throw new Error("BuildingContext missing");
  return ctx;
};
