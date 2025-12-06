// import { useState } from 'react';
import { Flame, Wind, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Survivor } from '../lib/api';

interface InteractiveMapProps {
  survivors: Survivor[];
  selectedId: string | null;
  currentFloor: number;
  onFloorChange: (floor: number) => void;
  onSelectSurvivor: (id: string) => void;
}

export function InteractiveMap({ 
  survivors, 
  selectedId, 
  currentFloor, 
  onFloorChange,
  onSelectSurvivor 
}: InteractiveMapProps) {
  const floors = [1, 2, 3];
  const currentFloorSurvivors = survivors.filter(s => s.floor === currentFloor);
  const selectedSurvivor = survivors.find(s => s.id === selectedId);

  // 화재 및 연기 위치 (예시)
  const hazards = [
    { type: 'fire', x: 50, y: 70, floor: 2 },
    { type: 'smoke', x: 60, y: 35, floor: 3 }
  ];

  const currentFloorHazards = hazards.filter(h => h.floor === currentFloor);

  return (
    <div className="h-full bg-slate-900 flex flex-col">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            건물 도면
          </h2>
          <p className="text-slate-400 text-sm mt-1">실시간 생존자 위치</p>
        </div>

        <div className="flex gap-2">
          {floors.map(floor => (
            <Button
              key={floor}
              onClick={() => onFloorChange(floor)}
              variant={currentFloor === floor ? 'default' : 'outline'}
              size="sm"
              className={currentFloor === floor ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300'}
            >
              {floor}F
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 relative">
        <div className="w-full h-full bg-slate-800 rounded-lg border border-slate-700 relative overflow-hidden">
          {/* 건물 레이아웃 */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-[10%] left-[10%] w-[35%] h-[35%] border-2 border-slate-600"></div>
            <div className="absolute top-[10%] right-[10%] w-[35%] h-[35%] border-2 border-slate-600"></div>
            <div className="absolute bottom-[10%] left-[10%] w-[35%] h-[35%] border-2 border-slate-600"></div>
            <div className="absolute bottom-[10%] right-[10%] w-[35%] h-[35%] border-2 border-slate-600"></div>
          </div>

          {/* 화재 및 연기 오버레이 */}
          {currentFloorHazards.map((hazard, idx) => (
            <div
              key={idx}
              className="absolute w-24 h-24 rounded-full opacity-60"
              style={{
                left: `${hazard.x}%`,
                top: `${hazard.y}%`,
                transform: 'translate(-50%, -50%)',
                background: hazard.type === 'fire' 
                  ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(100, 116, 139, 0.6) 0%, transparent 70%)',
                pointerEvents: 'none'
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {hazard.type === 'fire' ? (
                  <Flame className="w-5 h-5 text-red-400" />
                ) : (
                  <Wind className="w-5 h-5 text-slate-300" />
                )}
              </div>
            </div>
          ))}

          {/* 생존자 마커 */}
          {currentFloorSurvivors.map((survivor) => {
            const riskLevel = survivor.riskScore >= 18 ? 'high' : survivor.riskScore >= 12 ? 'medium' : 'low';
            const markerColor = riskLevel === 'high' ? 'bg-red-500' : 
                               riskLevel === 'medium' ? 'bg-orange-500' : 
                               'bg-green-500';
            const isSelected = selectedId === survivor.id;

            return (
              <button
                key={survivor.id}
                onClick={() => onSelectSurvivor(survivor.id)}
                className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all
                  ${isSelected ? 'scale-125 z-10' : 'hover:scale-110'}`}
                style={{
                  left: `${survivor.x}%`,
                  top: `${survivor.y}%`
                }}
              >
                <div className="relative">
                  <div className={`w-8 h-8 rounded-full ${markerColor} flex items-center justify-center
                    ${isSelected ? 'ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-800' : ''}`}
                  >
                    <span className="text-white text-xs">{survivor.rank}</span>
                  </div>
                  {isSelected && (
                    <div className={`absolute -top-8 left-1/2 transform -translate-x-1/2 
                      bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs whitespace-nowrap text-white`}
                    >
                      {survivor.room}
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {/* 구조 경로 (선택된 생존자가 있을 때) */}
          {selectedSurvivor && currentFloor === selectedSurvivor.floor && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <path
                d={`M 10 95% Q ${selectedSurvivor.x / 2}% 70%, ${selectedSurvivor.x}% ${selectedSurvivor.y}%`}
                stroke="#3b82f6"
                strokeWidth="2"
                fill="none"
                strokeDasharray="5,5"
              />
              <circle cx="10" cy="95%" r="4" fill="#3b82f6" />
            </svg>
          )}

          {/* 범례 */}
          <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-slate-300 text-xs">고위험</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-slate-300 text-xs">중위험</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-slate-300 text-xs">저위험</span>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="w-3 h-3 text-red-500" />
              <span className="text-slate-300 text-xs">화재</span>
            </div>
            <div className="flex items-center gap-2">
              <Wind className="w-3 h-3 text-slate-400" />
              <span className="text-slate-300 text-xs">연기</span>
            </div>
          </div>

          {/* 층 정보 */}
          <div className="absolute top-4 left-4">
            <Badge className="bg-blue-600 text-white border-0">
              {currentFloor}층 - {currentFloorSurvivors.length}명 감지
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
