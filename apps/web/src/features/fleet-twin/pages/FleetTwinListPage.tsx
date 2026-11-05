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
    <div className="relative min-h-screen text-slate-900 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Fixed background image with overlay */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <picture>
          <source srcSet={twinBgWebp} type="image/webp" />
          <img
            src={twinBgJpg}
            alt="Fleet Twin Background"
            className="w-full h-full object-cover object-center scale-105"
          />
        </picture>
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
      </div>

      {/* Top Simulated Lifecycle Banner */}
      <SimulatedBadge onRefresh={loadData} />

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm text-slate-900">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Roadways Fleet Digital Twin
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                  Simulation
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-corridor commercial freight telemetry, 48h future prediction & dynamic rerouting
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate('/roadways/dashboard')}
          className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs h-9 cursor-pointer shadow-xs"
        >
          Back to Roadways Dashboard
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Commercial Fleets</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{fleets.length || 4}</div>
          <div className="text-[11px] font-medium text-blue-700 mt-1">Major Indian Freight Carriers</div>
        </div>

        <div className="p-4 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Live Digital Trucks</span>
            <Truck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{vehicles.length || 24}</div>
          <div className="text-[11px] font-medium text-indigo-700 mt-1">Multi-axle & Container Rigs</div>
        </div>

        <div className="p-4 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Active Corridors</span>
            <Navigation className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">4 National</div>
          <div className="text-[11px] font-medium text-emerald-700 mt-1">NH 48, NH 44, NE 5 & Ghats</div>
        </div>

        <div className="p-4 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Prediction Horizon</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">48 Hours</div>
          <div className="text-[11px] font-medium text-amber-700 mt-1">Weather, Toll, Ghat & Rest Simulation</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200/90 shadow-sm text-slate-900">
        {/* Fleet Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setSelectedFleetId('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              selectedFleetId === 'all'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Vehicle Grid / Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-200 font-medium text-sm">
          Loading fleet digital twin network...
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="py-20 text-center text-slate-200 font-medium text-sm">
          No vehicles match your filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => {
            return (
              <div
                key={vehicle.id}
                className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-4 text-slate-900"
              >
                <div>
                  {/* Top: Registration & Truck Type */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-base font-black text-slate-900">
                      {vehicle.registration_number}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200 capitalize font-medium">
                      {vehicle.truck_type.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Route Corridor */}
                  <div className="text-xs font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-blue-600" />
                    <span className="line-clamp-1">{vehicle.route?.name || 'Chennai - Bengaluru Expressway'}</span>
                  </div>

                  {/* Driver Name & Load */}
                  <div className="text-[11px] text-slate-500 mb-3">
                    Driver: <span className="text-slate-800 font-medium">{vehicle.driver?.name || 'Rajesh Kannan'}</span> • Load: <span className="text-slate-800 font-medium">{vehicle.current_load_tons} / {vehicle.capacity_tons} T</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                      <span>Corridor Progress</span>
                      <span className="font-mono text-blue-700 font-bold">{vehicle.progress_pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"
                        style={{ width: `${vehicle.progress_pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer CTA */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Speed: {vehicle.speed_kmh} km/h</span>
                  </div>

                  <Button
                    onClick={() => navigate(`/roadways/fleet-twin/${vehicle.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3 gap-1 shadow-xs cursor-pointer"
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
      <footer className="text-center pt-8 pb-4 text-xs text-slate-300 font-medium">
        Predictions are generated by the NEXUS simulation engine.
      </footer>
    </div>
  );
};

