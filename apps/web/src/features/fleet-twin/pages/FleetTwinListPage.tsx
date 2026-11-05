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
import twinBgWebp from '../assets/fleet-twin-bg.webp';
import twinBgJpg from '../assets/fleet-twin-bg.jpg';

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
    <div className="relative min-h-screen text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Fixed background image with dark overlay for WCAG AA readability */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <picture>
          <source srcSet={twinBgWebp} type="image/webp" />
          <img
            src={twinBgJpg}
            alt="Fleet Twin Background"
            className="w-full h-full object-cover object-center scale-105"
          />
        </picture>
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px]" />
      </div>

      {/* Top Simulated Lifecycle Banner */}
      <SimulatedBadge onRefresh={loadData} />

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Roadways Fleet Digital Twin
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-wider">
                  Simulation
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Multi-corridor commercial freight telemetry, 48h future prediction & dynamic rerouting
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate('/roadways/dashboard')}
          className="border-white/20 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-9 cursor-pointer"
        >
          Back to Roadways Dashboard
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Commercial Fleets</span>
            <Building2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">{fleets.length || 4}</div>
          <div className="text-[11px] text-cyan-400 mt-1">Major Indian Freight Carriers</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Live Digital Trucks</span>
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white">{vehicles.length || 24}</div>
          <div className="text-[11px] text-indigo-400 mt-1">Multi-axle & Container Rigs</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Active Corridors</span>
            <Navigation className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">4 National</div>
          <div className="text-[11px] text-emerald-400 mt-1">NH 48, NH 44, NE 5 & Ghats</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Prediction Horizon</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">48 Hours</div>
          <div className="text-[11px] text-amber-400 mt-1">Weather, Toll, Ghat & Rest Simulation</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg">
        {/* Fleet Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setSelectedFleetId('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
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
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Vehicle Grid / Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Loading fleet digital twin network...
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          No vehicles match your filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => {
            return (
              <div
                key={vehicle.id}
                className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-xl hover:border-cyan-500/50 transition-all flex flex-col justify-between space-y-4"
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
                  <div className="text-xs font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
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
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Speed: {vehicle.speed_kmh} km/h</span>
                  </div>

                  <Button
                    onClick={() => navigate(`/roadways/fleet-twin/${vehicle.id}`)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs h-8 px-3 gap-1 shadow-md shadow-cyan-950 cursor-pointer"
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

      {/* Honest Minimal Disclosure Footer */}
      <footer className="text-center pt-8 pb-4 text-xs text-slate-400/80">
        Predictions are generated by the NEXUS simulation engine.
      </footer>
    </div>
  );
};

