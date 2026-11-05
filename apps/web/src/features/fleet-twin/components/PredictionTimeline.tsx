import React from 'react';
import {
  Clock,
  CloudRain,
  AlertTriangle,
  Car,
  Coffee,
  Fuel,
  Mountain,
  Wrench,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import {
  MockPredictionEvent,
  PredictionEventType,
  EVENT_TYPE_COLORS,
} from '@nexus-ways/shared';

interface PredictionTimelineProps {
  events: MockPredictionEvent[];
  selectedEventId?: string;
  onSelectEvent: (event: MockPredictionEvent) => void;
  totalDelayMinutes: number;
}

export const PredictionTimeline: React.FC<PredictionTimelineProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  totalDelayMinutes,
}) => {
  const getEventIcon = (type: PredictionEventType) => {
    switch (type) {
      case 'weather':
        return <CloudRain className="w-4 h-4 text-sky-400" />;
      case 'toll_delay':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'traffic':
        return <Car className="w-4 h-4 text-rose-400" />;
      case 'driver_break':
        return <Coffee className="w-4 h-4 text-emerald-400" />;
      case 'fuel_check':
        return <Fuel className="w-4 h-4 text-indigo-400" />;
      case 'ghat_slowdown':
        return <Mountain className="w-4 h-4 text-purple-400" />;
      case 'inspection':
        return <Wrench className="w-4 h-4 text-orange-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'high':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'medium':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
      default:
        return 'bg-slate-700/50 text-slate-400 border-slate-600';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">48-Hour Predictive Trajectory Timeline</h3>
            <p className="text-xs text-slate-400">
              Deterministic AI event projection across national freight checkpoints
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Cumulative Delay:</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            +{totalDelayMinutes} min (~{(totalDelayMinutes / 60).toFixed(1)}h)
          </span>
        </div>
      </div>

      {/* Horizontal Scrollable Event Cards */}
      <div className="relative">
        {events.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No impending delays predicted in the next 48 hours. Clear transit expected.
          </div>
        ) : (
          <div className="flex items-stretch gap-3 overflow-x-auto pb-4 pt-1 scrollbar-thin scrollbar-thumb-slate-800">
            {events.map((event) => {
              const isSelected = selectedEventId === event.id;
              const colors = EVENT_TYPE_COLORS[event.event_type] || {
                bg: 'bg-slate-800',
                text: 'text-slate-300',
                border: 'border-slate-700',
              };

              return (
                <div
                  key={event.id}
                  onClick={() => onSelectEvent(event)}
                  className={`flex-shrink-0 w-64 p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-cyan-400 shadow-lg shadow-cyan-950/50 scale-[1.02]'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  <div>
                    {/* Top row: Hour + Severity */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        +{event.hours_from_now}h Ahead
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${getSeverityBadge(
                          event.severity,
                        )}`}
                      >
                        {event.severity}
                      </span>
                    </div>

                    {/* Event type & location */}
                    <div className="flex items-start gap-2 mb-2">
                      <div className="p-1 rounded-md bg-slate-800 mt-0.5">
                        {getEventIcon(event.event_type)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100 line-clamp-1">
                          {event.location_name}
                        </div>
                        <div className={`text-[11px] font-medium capitalize ${colors.text}`}>
                          {event.event_type.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
                      {event.description}
                    </p>
                  </div>

                  {/* Bottom metrics */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-amber-400">
                      +{event.delay_minutes} min
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {event.confidence_pct}% Confidence
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

