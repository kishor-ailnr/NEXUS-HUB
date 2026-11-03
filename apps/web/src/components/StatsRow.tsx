import React from 'react';
import { DashboardStats } from '@nexus-ways/shared';
import { Card, CardContent } from './ui/card';
import { Truck, Layers, AlertTriangle, Gauge, CheckCircle2, ArrowUpRight, Activity } from 'lucide-react';

interface StatsRowProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export const StatsRow: React.FC<StatsRowProps> = ({ stats, isLoading = false }) => {
  const cards = [
    {
      id: 'active-vehicles',
      title: 'Active Vehicles',
      icon: Truck,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-100',
      value: stats?.activeVehicles?.available ? stats.activeVehicles.value : '—',
      available: stats?.activeVehicles?.available ?? false,
      tag: 'Live Tracking',
      tagColor: 'text-blue-700 bg-blue-50/60',
    },
    {
      id: 'total-fleet',
      title: 'Total Fleet Today',
      icon: Layers,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 border-indigo-100',
      value: stats?.totalFleetToday?.available ? stats.totalFleetToday.value : '—',
      available: stats?.totalFleetToday?.available ?? false,
      tag: 'Registered',
      tagColor: 'text-indigo-700 bg-indigo-50/60',
    },
    {
      id: 'active-alerts',
      title: 'Active Alerts',
      icon: AlertTriangle,
      color: stats && stats.activeAlerts > 0 ? 'text-rose-600' : 'text-emerald-600',
      bgColor: stats && stats.activeAlerts > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100',
      value: stats ? stats.activeAlerts : 0,
      available: true,
      tag: stats && stats.activeAlerts > 0 ? 'Action Needed' : 'Nominal',
      tagColor: stats && stats.activeAlerts > 0 ? 'text-rose-700 bg-rose-50/60' : 'text-emerald-700 bg-emerald-50/60',
    },
    {
      id: 'avg-speed',
      title: 'Average Speed',
      icon: Gauge,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 border-amber-100',
      value: stats?.avgSpeedKmh?.available ? `${stats.avgSpeedKmh.value} km/h` : '—',
      available: stats?.avgSpeedKmh?.available ?? false,
      tag: 'Fleet Telemetry',
      tagColor: 'text-amber-700 bg-amber-50/60',
    },
    {
      id: 'arrived-count',
      title: 'Arrived Today',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-100',
      value: stats?.arrivedCount?.available ? stats.arrivedCount.value : '—',
      available: stats?.arrivedCount?.available ?? false,
      tag: 'Completed',
      tagColor: 'text-emerald-700 bg-emerald-50/60',
    },
    {
      id: 'departed-count',
      title: 'Departed Today',
      icon: ArrowUpRight,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 border-teal-100',
      value: stats?.departedCount?.available ? stats.departedCount.value : '—',
      available: stats?.departedCount?.available ?? false,
      tag: 'Dispatched',
      tagColor: 'text-teal-700 bg-teal-50/60',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.id}
            data-testid={`stat-card-${card.id}`}
            className="border border-slate-800 shadow-xs hover:shadow-md hover:border-black transition-all duration-200 bg-white rounded-xl overflow-hidden group"
          >
            <CardContent className="p-3 sm:p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 truncate group-hover:text-slate-700 transition-colors">
                  {card.title}
                </span>
                <div className={`p-1.5 rounded-lg border ${card.bgColor} transition-transform group-hover:scale-105`}>
                  <Icon className={`w-3.5 h-3.5 ${card.color}`} />
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                {isLoading ? (
                  <div className="h-7 w-14 bg-slate-100 animate-pulse rounded" />
                ) : (
                  <span
                    className={`text-xl sm:text-2xl font-bold tracking-tight ${
                      card.available ? 'text-slate-900' : 'text-slate-400 font-mono text-base'
                    }`}
                  >
                    {card.value}
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${card.tagColor}`}>
                  {card.tag}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
