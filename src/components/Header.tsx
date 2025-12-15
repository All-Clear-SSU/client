import { AlertTriangle, Bell, Power } from 'lucide-react';
import { Badge } from './ui/badge';
// import { Button } from './ui/button';

interface HeaderProps {
  currentTime: string;
  currentDate: string;
  alertLevel: 'high' | 'medium' | 'low';
  totalSurvivors: number;
}

export function Header({ currentTime, currentDate, alertLevel, totalSurvivors }: HeaderProps) {
  const alertColors = {
    high: 'bg-red-600 hover:bg-red-700',
    medium: 'bg-orange-500 hover:bg-orange-600',
    low: 'bg-green-600 hover:bg-green-700'
  };

  const alertText = {
    high: '긴급 경보',
    medium: '주의 경보',
    low: '정상'
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>s
            <h1 className="text-white">재난 대응 시스템</h1>
            <p className="text-slate-400 text-xs">Emergency Response System</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-white">{currentTime}</div>
          <div className="text-slate-400 text-xs">{currentDate}</div>
        </div>

        <Badge className={`${alertColors[alertLevel]} text-white border-0`}>
          <AlertTriangle className="w-3 h-3 mr-1" />
          {alertText[alertLevel]}
        </Badge>

        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-slate-400" />
          <span className="text-white">{totalSurvivors}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <Power className="w-4 h-4" />
          <span className="text-sm">admin</span>
        </div>
      </div>
    </header>
  );
}
