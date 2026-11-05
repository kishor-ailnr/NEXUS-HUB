import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Building2,
  Navigation,
  ShieldAlert,
  Search,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MockFleet, MockVehicle } from '@nexus-ways/shared';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { Button } from '../../../components/ui/button';

export const FleetTwinListPage: React.FC = () => {
  const navigate = useNavigate();
  const [fleets, setFleets] = useState<MockFleet[]>([]);
  const [vehicles, setVehicles] = useState<MockVehicle[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [fData, vData] = await Promise.all([
        fleetTwinApi.getFleets(),
        fleetTwinApi.getAllVehicles(),
      ]);
      setFleets(fData);
      setVehicles(vData);
    } catch (err) {
      console.error('Failed to load fleet twin list data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredVehicles = vehicles.filter((v) => {
    const matchesFleet = selectedFleetId === 'all' || v.fleet_id === selectedFleetId;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      v.registration_number.toLowerCase().includes(term) ||
      (v.driver?.name || '').toLowerCase().includes(term) ||
      (v.route?.corridor || '').toLowerCase().includes(term);
    return matchesFleet && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Simulated Lifecycle Banner */}
      <SimulatedBadge onRefresh={loadData} />

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Roadways Fleet Digital Twin
              </h1>
              <p className="text-xs text-slate-400">
                Multi-corridor commercial freight telemetry, 48h future prediction & dynamic rerouting
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate('/roadways/dashboard')}
          className="border-slate-800 text-slate-300 hover:text-white text-xs h-9"
        >
          Back to Roadways Dashboard
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Simulated Fleets</span>
            <Building2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">{fleets.length || 4}</div>
          <div className="text-[11px] text-cyan-400 mt-1">Major Indian Freight Carriers</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Live Simulated Trucks</span>
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white">{vehicles.length || 24}</div>
          <div className="text-[11px] text-indigo-400 mt-1">Multi-axle & Container Rigs</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Active Corridors</span>
            <Navigation className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">4 National</div>
          <div className="text-[11px] text-emerald-400 mt-1">NH 48, NH 44, NE 5 & Ghats</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Prediction Horizon</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">48 Hours</div>
          <div className="text-[11px] text-amber-400 mt-1">Weather, Toll, Ghat & Rest Simulation</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-lg">
        {/* Fleet Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setSelectedFleetId('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedFleetId === 'all'
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Fleets ({vehicles.length})
          </button>
          {fleets.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFleetId(f.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                selectedFleetId === f.id
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f.name.split(' ')[0]} ({vehicles.filter((v) => v.fleet_id === f.id).length})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search registration or driver..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Vehicle Grid / Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500 text-sm">
          Loading simulated fleet digital twin network...
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-sm">
          No vehicles match your filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => {
            const riskColor =
              vehicle.progress_pct > 70
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

            return (
              <div
                key={vehicle.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Top: Registration & Truck Type */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-base font-black text-white">
                      {vehicle.registration_number}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                      {vehicle.truck_type.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Route Corridor */}
                  <div className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="line-clamp-1">{vehicle.route?.name || 'Chennai - Bengaluru Expressway'}</span>
                  </div>

                  {/* Driver Name & Load */}
                  <div className="text-[11px] text-slate-400 mb-3">
                    Driver: <span className="text-slate-200">{vehicle.driver?.name || 'Rajesh Kannan'}</span> • Load: <span className="text-slate-200">{vehicle.current_load_tons} / {vehicle.capacity_tons} T</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Corridor Progress</span>
                      <span className="font-mono text-cyan-400 font-bold">{vehicle.progress_pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                        style={{ width: `${vehicle.progress_pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer CTA */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Speed: {vehicle.speed_kmh} km/h</span>
                  </div>

                  <Button
                    onClick={() => navigate(`/roadways/fleet-twin/${vehicle.id}`)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs h-8 px-3 gap-1 shadow-md shadow-cyan-950"
                  >
                    <span>Inspect Twin</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

