import React from 'react';
import { Sliders, CloudRain, Clock, AlertOctagon, RotateCcw, Car, Sparkles, TrendingUp } from 'lucide-react';
import { WhatIfParams, DEFAULT_WHAT_IF_PARAMS, VehicleDigitalTwinData } from '@nexus-ways/shared';

interface WhatIfPanelProps {
  params: WhatIfParams;
  onChange: (updated: WhatIfParams) => void;
  isLoading?: boolean;
  scenarioComparison?: VehicleDigitalTwinData['scenario_comparison'];
  explanation?: VehicleDigitalTwinData['explanation'];
}

export const WhatIfPanel: React.FC<WhatIfPanelProps> = ({
  params,
  onChange,
  isLoading = false,
  scenarioComparison,
  explanation,
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

  const handleTrafficChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...params,
      traffic_congestion_multiplier: parseFloat(e.target.value),
    });
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_WHAT_IF_PARAMS });
  };

  const isModified =
    params.rain_severity_multiplier !== 1.0 ||
    params.toll_strike_hours !== 0 ||
    params.breakdown_hours !== 0 ||
    Boolean(params.traffic_congestion_multiplier && params.traffic_congestion_multiplier !== 1.0);

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm text-slate-900 space-y-4">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            What-If Scenario Simulation Engine
          </h4>
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Baseline</span>
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
              {(params.rain_severity_multiplier || 1.0).toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={params.rain_severity_multiplier || 1.0}
            onChange={handleRainChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>Normal (1.0x)</span>
            <span>Ghat Cloudburst (2.0x)</span>
            <span>Severe Cyclone (3.0x)</span>
          </div>
        </div>

        {/* Traffic Multiplier */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Car className="w-3.5 h-3.5 text-indigo-600" />
              <span>Traffic Congestion Surge</span>
            </span>
            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              {(params.traffic_congestion_multiplier || 1.0).toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.1"
            value={params.traffic_congestion_multiplier || 1.0}
            onChange={handleTrafficChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>Baseline (1.0x)</span>
            <span>Evening Commute (1.7x)</span>
            <span>Urban Gridlock (2.5x)</span>
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
              {params.toll_strike_hours || 0}h
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="6"
            step="0.5"
            value={params.toll_strike_hours || 0}
            onChange={handleTollStrikeChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>Operational (0h)</span>
            <span>Local Protest (3h)</span>
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
              {params.breakdown_hours || 0}h
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="4"
            step="0.5"
            value={params.breakdown_hours || 0}
            onChange={handleBreakdownChange}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
            <span>None (0h)</span>
            <span>Tire/Hose Fix (2h)</span>
            <span>Alternator/Tow (4h)</span>
          </div>
        </div>
      </div>

      {/* Scenario vs Baseline Comparison Card */}
      {isModified && scenarioComparison && (
        <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
              <span>Scenario Impact vs Baseline</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
              +{scenarioComparison.eta_delta_minutes} min delay
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="bg-white/80 p-2 rounded border border-amber-200/60">
              <div className="text-slate-500 text-[10px]">Baseline ETA</div>
              <div className="font-mono font-semibold text-slate-800">
                {new Date(scenarioComparison.baseline_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="bg-white/80 p-2 rounded border border-amber-200/60">
              <div className="text-slate-500 text-[10px]">Risk Delta</div>
              <div className={`font-mono font-semibold ${scenarioComparison.risk_delta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {scenarioComparison.risk_delta > 0 ? `+${scenarioComparison.risk_delta}` : scenarioComparison.risk_delta} pts
              </div>
            </div>
            <div className="bg-white/80 p-2 rounded border border-amber-200/60">
              <div className="text-slate-500 text-[10px]">Added Cost</div>
              <div className="font-mono font-semibold text-amber-900">
                +₹{scenarioComparison.additional_cost_inr}
              </div>
            </div>
          </div>

          {explanation && (
            <div className="text-[11px] text-amber-950 bg-white/70 p-2 rounded border border-amber-200/60 leading-relaxed">
              <span className="font-bold">Mitigation Strategy: </span>
              {explanation.mitigation}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

