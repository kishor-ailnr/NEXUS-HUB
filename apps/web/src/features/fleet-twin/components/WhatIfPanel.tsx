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
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl text-slate-200">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-100">
            What-If Scenario Simulation
          </h4>
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
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
            <span className="flex items-center gap-1.5 text-slate-300">
              <CloudRain className="w-3.5 h-3.5 text-sky-400" />
              <span>Rain / Monsoon Severity</span>
            </span>
            <span className="font-mono font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
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
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Normal (1.0x)</span>
            <span>Ghat Cloudburst (2.0x)</span>
            <span>Severe Cyclone (3.0x)</span>
          </div>
        </div>

        {/* Toll Strike */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>FASTag Toll Strike Duration</span>
            </span>
            <span className="font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
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
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Operational (0h)</span>
            <span>Major Protest (3h)</span>
            <span>Corridor Blockade (6h)</span>
          </div>
        </div>

        {/* Breakdown */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-300">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulated Mechanical Breakdown</span>
            </span>
            <span className="font-mono font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
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
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>None (0h)</span>
            <span>Tire/Hose Fix (2h)</span>
            <span>Alternator/OOM (4h)</span>
          </div>
        </div>
      </div>

      {isModified && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-cyan-300">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Digital Twin recalculating future trajectory...</span>
          </span>
        </div>
      )}
    </div>
  );
};

