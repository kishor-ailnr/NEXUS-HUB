import React, { useState } from 'react';
import { Vehicle, Driver, CreateVehicleDto } from '@nexus-ways/shared';
import { vehiclesService } from '../services/vehicles';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import {
  Truck,
  Search,
  Plus,
  Radio,
  MapPin,
  User,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  UserPlus,
  Eye,
  EyeOff,
  X,
  ArrowUpRight,
  Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import { driversService } from '../services/drivers';
// FLEET-TWIN (mock) - removable
import { useNavigate } from 'react-router-dom';
import { fleetTwinApi } from '../features/fleet-twin';
import { Sparkles } from 'lucide-react';

interface VehicleSidebarProps {
  vehicles: Vehicle[];
  drivers: Driver[];
  selectedVehicleId?: string | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onVehicleCreated: (vehicle: Vehicle) => void;
  onDriverCreated?: (driver: Driver) => void;
  onCreateTrip: (vehicle: Vehicle) => void;
  currentUserRole?: string;
}

export const VehicleSidebar: React.FC<VehicleSidebarProps> = ({
  vehicles,
  drivers,
  selectedVehicleId,
  onSelectVehicle,
  onVehicleCreated,
  onDriverCreated,
  onCreateTrip,
  currentUserRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Driver Form State
  const [isAddDriverModalOpen, setIsAddDriverModalOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverEmail, setNewDriverEmail] = useState('');
  const [newDriverLicense, setNewDriverLicense] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverPassword, setNewDriverPassword] = useState('');
  const [showDriverPassword, setShowDriverPassword] = useState(false);
  const [isSubmittingDriver, setIsSubmittingDriver] = useState(false);

  // Add Vehicle Form State
  const [regNumber, setRegNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Heavy Truck');
  const [capacityKg, setCapacityKg] = useState('15000');
  const [assignedDriverId, setAssignedDriverId] = useState('');

  const isManager = currentUserRole === 'manager';

  // FLEET-TWIN (mock) - removable
  const navigate = useNavigate();
  const [fleetTwinEnabled, setFleetTwinEnabled] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    fleetTwinApi.getStatus().then((st) => {
      if (mounted && st.enabled) {
        setFleetTwinEnabled(true);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim() || !newDriverEmail.trim() || !newDriverLicense.trim()) {
      toast.error('Full name, email, and license number are required');
      return;
    }

    try {
      setIsSubmittingDriver(true);
      const newDriver = await driversService.createDriver({
        fullName: newDriverName.trim(),
        email: newDriverEmail.trim(),
        licenseNumber: newDriverLicense.trim().toUpperCase(),
        phone: newDriverPhone.trim() || undefined,
        password: newDriverPassword.trim() || undefined,
      });

      toast.success(`Driver ${newDriver.user?.full_name || newDriverName} registered successfully`);
      onDriverCreated?.(newDriver);
      setIsAddDriverModalOpen(false);
      setNewDriverName('');
      setNewDriverEmail('');
      setNewDriverLicense('');
      setNewDriverPhone('');
      setNewDriverPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to register driver');
    } finally {
      setIsSubmittingDriver(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) =>
    v.registration_number.toLowerCase().includes(searchTerm.toLowerCase().trim()),
  );

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber.trim()) {
      toast.error('Registration number is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const newVehicle = await vehiclesService.createVehicle({
        registrationNumber: regNumber.trim().toUpperCase(),
        vehicleType,
        capacityKg: capacityKg ? Number(capacityKg) : undefined,
        assignedDriverId: assignedDriverId || undefined,
      });

      toast.success(`Vehicle ${newVehicle.registration_number} added successfully`);
      onVehicleCreated(newVehicle);
      setIsAddModalOpen(false);
      setRegNumber('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="roadways-sidebar">
      {/* Sidebar Header & Search */}
      <Card className="border-slate-800 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base font-bold text-slate-900">Fleet Registry</CardTitle>
          </div>
          {isManager && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => setIsAddDriverModalOpen(true)}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-2.5 shadow-sm"
                data-testid="add-driver-button"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Driver</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setIsAddModalOpen(true)}
                className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-2.5 shadow-sm"
                data-testid="add-vehicle-button"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Vehicle</span>
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search registration..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs h-9 bg-slate-50 border-slate-200 focus:bg-white"
              data-testid="vehicle-search-input"
            />
          </div>

          {/* FLEET-TWIN integration - removable */}
          {fleetTwinEnabled && (
            <button
              onClick={() => navigate('/roadways/fleet-twin')}
              className="w-full p-2.5 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-400 text-left transition-all shadow-xs hover:shadow-sm group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 group-hover:scale-105 transition-transform">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>Fleet Digital Twin</span>
                      <span className="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        Live Twin
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">48h Predictive Timeline & Rerouting</div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </button>
          )}

          {/* Vehicle List */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filteredVehicles.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                {searchTerm ? 'No matching vehicles found.' : 'No vehicles in fleet. Add one above!'}
              </div>
            ) : (
              filteredVehicles.map((v) => {
                const isSelected = selectedVehicleId === v.id;
                const isTwin = (v as any).is_twin;
                const twinStatus = (v as any).twin_status;
                const isDelayed = twinStatus === 'delayed';
                const isResting = twinStatus === 'resting';
                const isEnRoute = twinStatus === 'en_route';
                const isIdle = twinStatus === 'idle' || v.status === 'idle';
                const isActive = isEnRoute || (!twinStatus && v.status === 'active');
                const isMaintenance = v.status === 'maintenance';

                const truckType = (v as any).truck_type_label || v.vehicle_type;
                const routeShortName =
                  (v as any).route_short_name ||
                  (v.active_trip
                    ? `${v.active_trip.origin_label} → ${v.active_trip.destination_label}`
                    : undefined);
                const progressPct = (v as any).progress_pct;
                const nextCheckpoint = (v as any).next_checkpoint_name;
                const predictedEta = (v as any).predicted_eta;

                return (
                  <div
                    key={v.id}
                    onClick={() => onSelectVehicle(v)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                        : 'border-slate-800/80 hover:border-black bg-white'
                    }`}
                    data-testid={`vehicle-card-${v.id}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-900 tracking-wide font-mono">
                        {v.registration_number}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${
                          isDelayed
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : isResting
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isMaintenance
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isDelayed
                          ? 'Delayed'
                          : isResting
                          ? 'Resting'
                          : isActive
                          ? 'En Route'
                          : isIdle
                          ? 'Idle'
                          : v.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-slate-500 text-[11px]">
                      {/* Truck Type & Route */}
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="font-medium truncate max-w-[150px]">{truckType}</span>
                        {v.latest_gps?.speed_kmh !== undefined && (
                          <span className="font-semibold text-blue-600 flex items-center gap-1 shrink-0 font-mono">
                            <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-500" />
                            {v.latest_gps.speed_kmh} km/h
                          </span>
                        )}
                      </div>

                      {/* Corridor route */}
                      {routeShortName && (
                        <div className="flex items-center gap-1 text-slate-600 font-medium truncate">
                          <Navigation className="w-3 h-3 text-cyan-600 shrink-0" />
                          <span className="truncate">{routeShortName}</span>
                        </div>
                      )}

                      {/* Driver */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[130px]">
                            {v.driver?.user?.full_name || v.driver?.license_number || 'Unassigned'}
                          </span>
                        </span>
                        {v.convoy_name && (
                          <span className="text-purple-600 font-medium text-[10px]">
                            {v.convoy_name}
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {progressPct !== undefined && (
                        <div className="pt-0.5 space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>Corridor Progress</span>
                            <span className="font-bold text-slate-700">{Math.round(progressPct)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isDelayed
                                  ? 'bg-amber-500'
                                  : isResting
                                  ? 'bg-blue-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Next Checkpoint and ETA */}
                      {nextCheckpoint && (
                        <div className="text-[10px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200/80 flex items-center justify-between mt-1">
                          <span className="truncate max-w-[150px] flex items-center gap-1 font-medium">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            Next: {nextCheckpoint}
                          </span>
                          {predictedEta && (
                            <span className="text-slate-500 font-mono shrink-0 ml-1">
                              ETA {new Date(predictedEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions: Inspect Twin button for twin vehicles; Start Trip for real vehicles */}
                    {isTwin ? (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/roadways/fleet-twin/${v.id}`);
                          }}
                          className="h-6 text-[10px] px-2.5 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 font-semibold cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect Twin</span>
                        </Button>
                      </div>
                    ) : isManager && v.status === 'idle' ? (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateTrip(v);
                          }}
                          className="h-6 text-[10px] px-2 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Start Trip</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Vehicle Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900">Add Vehicle to Fleet</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                aria-label="Close add vehicle dialog"
                data-testid="close-add-vehicle-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Register a commercial vehicle for operational routing and live simulation.
            </p>

            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Registration Number *
                </label>
                <Input
                  required
                  placeholder="e.g. MH-12-AB-1234"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  className="uppercase font-mono text-sm"
                  data-testid="registration-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-slate-200 bg-white px-3 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Heavy Truck">Heavy Truck (16-Wheel / Multi-Axle)</option>
                  <option value="Medium LCV">Medium LCV (Light Commercial)</option>
                  <option value="Trailer Truck">Trailer Truck (Container Carrier)</option>
                  <option value="Refrigerated Van">Refrigerated Cargo Van</option>
                  <option value="Tanker">Liquid Tanker</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Payload Capacity (kg)
                </label>
                <Input
                  type="number"
                  placeholder="15000"
                  value={capacityKg}
                  onChange={(e) => setCapacityKg(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Assign Default Driver
                </label>
                <select
                  value={assignedDriverId}
                  onChange={(e) => setAssignedDriverId(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-slate-200 bg-white px-3 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- No Driver Assigned --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.user?.full_name || d.license_number} ({d.license_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="submit-vehicle-button"
                >
                  {isSubmitting ? 'Registering...' : 'Register Vehicle'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Add Driver Modal */}
      {isAddDriverModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsAddDriverModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900">Register Fleet Driver</h3>
              <button
                type="button"
                onClick={() => setIsAddDriverModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                aria-label="Close add driver dialog"
                data-testid="close-add-driver-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Register a commercial driver for fleet assignment and live turn-by-turn routing.
            </p>

            <form onSubmit={handleAddDriver} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Full Name *
                </label>
                <Input
                  required
                  placeholder="e.g. Rajesh Sharma"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  className="text-xs"
                  data-testid="driver-name-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Email Address *
                </label>
                <Input
                  type="email"
                  required
                  placeholder="e.g. rajesh.driver@nexusways.com"
                  value={newDriverEmail}
                  onChange={(e) => setNewDriverEmail(e.target.value)}
                  className="text-xs"
                  data-testid="driver-email-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Driving License Number *
                </label>
                <Input
                  required
                  placeholder="e.g. MH12-2023-0098765"
                  value={newDriverLicense}
                  onChange={(e) => setNewDriverLicense(e.target.value)}
                  className="uppercase font-mono text-xs"
                  data-testid="driver-license-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={newDriverPhone}
                  onChange={(e) => setNewDriverPhone(e.target.value)}
                  className="text-xs"
                  data-testid="driver-phone-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Initial Password
                </label>
                <div className="relative">
                  <Input
                    type={showDriverPassword ? 'text' : 'password'}
                    placeholder="Set initial password (default: Driver@Nexus123)"
                    value={newDriverPassword}
                    onChange={(e) => setNewDriverPassword(e.target.value)}
                    className="text-xs pr-9"
                    data-testid="driver-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDriverPassword(!showDriverPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showDriverPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  The driver will use this password to sign in to the Driver Console.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddDriverModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingDriver}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="submit-driver-button"
                >
                  {isSubmittingDriver ? 'Registering...' : 'Register Driver'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
