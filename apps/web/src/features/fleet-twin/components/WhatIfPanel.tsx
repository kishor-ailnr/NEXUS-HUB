import React from 'react';
import { Sliders, CloudRain, Clock, AlertOctagon, RotateCcw } from 'lucide-react';
import { WhatIfParams, DEFAULT_WHAT_IF_PARAMS } from '@nexus-ways/shared';

interface WhatIfPanelProps {
  params: WhatIfParams;
  onChange: (updated: WhatIfParams) => void;
  isLoading?: boolean;
}

export const WhatIfPanel: React.FC<WhatIfPanelProps> = ({
  params,
  onChange,
  isLoading = false,
}) => {
  const handleRainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...params,
      rain_severity_multiplier: parseFloat(e.target.value),
    });
  };

  const handleTollStrikeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...params,
      toll_strike_hours: parseFloat(e.target.value),
    });
  };

  const handleBreakdownChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...params,
      breakdown_hours: parseFloat(e.target.value),
    });
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_WHAT_IF_PARAMS });
  };

  const isModified =
    params.rain_severity_multiplier !== 1.0 ||
    params.toll_strike_hours !== 0 ||
    params.breakdown_hours !== 0;

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm text-slate-900">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            What-If Scenario Simulation
          </h4>
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
        )}
      </div>

      <div className="space-y-4 text-xs">
        {/* Rain Severity */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <CloudRain className="w-3.5 h-3.5 text-blue-600" />
              <span>Rain / Monsoon Severity</span>
            </span>
            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {params.rain_severity_multiplier.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={params.rain_severity_multiplier}
            onChange={handleRainChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>Normal (1.0x)</span>
            <span>Ghat Cloudburst (2.0x)</span>
            <span>Severe Cyclone (3.0x)</span>
          </div>
        </div>

        {/* Toll Strike */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>FASTag Toll Strike Duration</span>
            </span>
            <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {params.toll_strike_hours}h
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="6"
            step="0.5"
            value={params.toll_strike_hours}
            onChange={handleTollStrikeChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>Operational (0h)</span>
            <span>Major Protest (3h)</span>
            <span>Corridor Blockade (6h)</span>
          </div>
        </div>

        {/* Breakdown */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
              <span>Simulated Mechanical Breakdown</span>
            </span>
            <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              {params.breakdown_hours}h
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="4"
            step="0.5"
            value={params.breakdown_hours}
            onChange={handleBreakdownChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>None (0h)</span>
            <span>Tire/Hose Fix (2h)</span>
            <span>Alternator/OOM (4h)</span>
          </div>
        </div>
      </div>

      {isModified && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-blue-700 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
            <span>Digital Twin recalculating future trajectory...</span>
          </span>
        </div>
      )}
    </div>
  );
};

