import React, { useState, useEffect } from 'react';
import {
  Vehicle,
  Driver,
  CheckpointItem,
  Trip,
  CargoType,
  DispatchPriority,
  RecommendedCheckpoint,
  RecommendedCheckpointType,
  DispatchPreviewResponse,
  EligibleVehicleItem,
  EligibleDriverItem,
} from '@nexus-ways/shared';
import { tripsService } from '../services/trips';
import { vehiclesService } from '../services/vehicles';
import { driversService } from '../services/drivers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Route,
  MapPin,
  Truck,
  User,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  X,
  Package,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface CreateTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  drivers: Driver[];
  preselectedVehicle?: Vehicle | null;
  onTripCreated: (trip: Trip) => void;
}

const CHECKPOINT_TYPES: { value: RecommendedCheckpointType; label: string }[] = [
  { value: 'toll_plaza', label: 'Toll Plaza' },
  { value: 'fuel_station', label: 'Fuel Station' },
  { value: 'rest_area', label: 'Dhaba / Rest Area' },
  { value: 'truck_parking', label: 'Truck Parking' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'logistics_hub', label: 'Logistics Hub' },
  { value: 'service_station', label: 'Service Station' },
  { value: 'emergency', label: 'Emergency Point' },
];

export const CreateTripModal: React.FC<CreateTripModalProps> = ({
  isOpen,
  onClose,
  vehicles,
  drivers,
  preselectedVehicle,
  onTripCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Trip & Cargo
  const [originAddress, setOriginAddress] = useState('Chennai Port, Tamil Nadu');
  const [destAddress, setDestAddress] = useState('Electronic City, Bengaluru, Karnataka');
  const [departureAt, setDepartureAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [cargoType, setCargoType] = useState<CargoType>('general');
  const [cargoWeightKg, setCargoWeightKg] = useState<number>(8000);
  const [cargoDescription, setCargoDescription] = useState('Palletized industrial cargo');
  const [priority, setPriority] = useState<DispatchPriority>('normal');
  const [deliveryRequirements, setDeliveryRequirements] = useState('Standard seal verification');
  const [speedMultiplier, setSpeedMultiplier] = useState(60);

  // Step 2: Route & Checkpoints
  const [checkpointCount, setCheckpointCount] = useState<number>(3);
  const [preview, setPreview] = useState<DispatchPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<RecommendedCheckpoint[]>([]);
  const [newCpLabel, setNewCpLabel] = useState('');
  const [newCpType, setNewCpType] = useState<RecommendedCheckpointType>('rest_area');
  const [newCpLat, setNewCpLat] = useState('');
  const [newCpLng, setNewCpLng] = useState('');

  // Step 3: Eligible Vehicle & Driver + Confirm
  const [eligibleVehicles, setEligibleVehicles] = useState<EligibleVehicleItem[]>([]);
  const [eligibleDrivers, setEligibleDrivers] = useState<EligibleDriverItem[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    if (preselectedVehicle) {
      setVehicleId(preselectedVehicle.id);
      if (preselectedVehicle.assigned_driver_id) {
        setDriverId(preselectedVehicle.assigned_driver_id);
      }
    }
  }, [isOpen, preselectedVehicle]);

  const loadEligibility = async () => {
    try {
      const [vList, dList] = await Promise.all([
        vehiclesService.getAvailableVehicles(cargoWeightKg).catch(() =>
          vehicles.map((v) => ({
            ...v,
            eligible: v.status === 'idle' && !v.active_trip,
            ineligibilityReason: v.status !== 'idle' ? `Status: ${v.status}` : undefined,
          })),
        ),
        driversService.getEligibleDrivers().catch(() =>
          drivers.map((d) => ({
            ...d,
            eligible: d.status === 'available',
            ineligibilityReason: d.status !== 'available' ? `Status: ${d.status}` : undefined,
          })),
        ),
      ]);
      setEligibleVehicles(vList);
      setEligibleDrivers(dList);

      const firstOkV =
        (preselectedVehicle && vList.find((v) => v.id === preselectedVehicle.id && v.eligible)) ||
        vList.find((v) => v.eligible);
      if (firstOkV && !vehicleId) setVehicleId(firstOkV.id);

      const firstOkD = dList.find((d) => d.eligible);
      if (firstOkD && !driverId) setDriverId(firstOkD.id);
    } catch {
      // ignore
    }
  };

  const runRoutePreview = async (countOverride?: number) => {
    if (!originAddress.trim() || !destAddress.trim()) {
      toast.error('Source and destination locations are required');
      return false;
    }
    setPreviewLoading(true);
    try {
      const res = await tripsService.previewDispatch({
        originAddress: originAddress.trim(),
        destinationAddress: destAddress.trim(),
        departureAt: departureAt ? new Date(departureAt).toISOString() : undefined,
        checkpointCount: countOverride ?? checkpointCount,
        cargoType,
        cargoWeightKg,
        simulationSpeedMultiplier: speedMultiplier,
      });
      setPreview(res);
      setCheckpoints(res.recommendedCheckpoints || []);
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to calculate route preview');
      return false;
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleNextToStep2 = async () => {
    const ok = await runRoutePreview();
    if (ok) setStep(2);
  };

  const handleNextToStep3 = async () => {
    await loadEligibility();
    setStep(3);
  };

  const handleAddCustomCheckpoint = () => {
    if (!newCpLabel.trim()) {
      toast.error('Checkpoint name is required');
      return;
    }
    const lat = newCpLat
      ? parseFloat(newCpLat)
      : preview?.originCoords
      ? (preview.originCoords.lat + preview.destinationCoords.lat) / 2
      : 12.95;
    const lng = newCpLng
      ? parseFloat(newCpLng)
      : preview?.originCoords
      ? (preview.originCoords.lng + preview.destinationCoords.lng) / 2
      : 78.5;

    const prevCum = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].cumulativeDistanceKm : 0;
    const added: RecommendedCheckpoint = {
      id: `custom-cp-${Date.now()}`,
      label: newCpLabel.trim(),
      type: newCpType,
      lat,
      lng,
      distanceFromPrevKm: 25,
      cumulativeDistanceKm: Math.round((prevCum + 25) * 10) / 10,
      plannedArrivalIso: new Date().toISOString(),
      reason: 'Custom operator checkpoint',
    };
    setCheckpoints((prev) => [...prev, added]);
    setNewCpLabel('');
    setNewCpLat('');
    setNewCpLng('');
  };

  const moveCheckpoint = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= checkpoints.length) return;
    setCheckpoints((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const handleConfirmDispatch = async () => {
    if (!vehicleId || !driverId) {
      toast.error('Please select an eligible vehicle and driver');
      return;
    }

    const selectedV = eligibleVehicles.find((v) => v.id === vehicleId);
    if (selectedV && !selectedV.eligible) {
      toast.error(selectedV.ineligibilityReason || 'Selected vehicle is not eligible');
      return;
    }
    const selectedD = eligibleDrivers.find((d) => d.id === driverId);
    if (selectedD && !selectedD.eligible) {
      toast.error(selectedD.ineligibilityReason || 'Selected driver is not eligible');
      return;
    }

    setIsSubmitting(true);
    try {
      const payloadCheckpoints: CheckpointItem[] = checkpoints.map((cp) => ({
        label: `${cp.label} [${cp.type.replace(/_/g, ' ')}]`,
        lat: cp.lat,
        lng: cp.lng,
      }));

      const trip = await tripsService.dispatchTrip({
        vehicleId,
        driverId,
        originAddress: originAddress.trim(),
        destinationAddress: destAddress.trim(),
        checkpoints: payloadCheckpoints,
        simulationSpeedMultiplier: speedMultiplier,
        cargoType,
        cargoWeightKg,
        cargoDescription,
        priority,
        deliveryRequirements,
        departureAt: departureAt ? new Date(departureAt).toISOString() : undefined,
        autoStart,
      });

      toast.success(
        autoStart
          ? 'Fleet dispatched and live tracking started!'
          : 'Fleet trip scheduled and assigned!',
      );
      onTripCreated(trip);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch fleet trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedVehicleObj = eligibleVehicles.find((v) => v.id === vehicleId);
  const selectedDriverObj = eligibleDrivers.find((d) => d.id === driverId);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Dispatch New Fleet Trip"
    >
      <div className="w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden">
        {/* Header & Stepper */}
        <div className="shrink-0 px-5 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-600 text-white">
                <Route className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Dispatch New Fleet Trip</h2>
                <p className="text-xs text-slate-500">
                  Unified route calculation, checkpoint planning, resource validation &amp; live tracking
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              aria-label="Close dispatch modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              [1, '1. Trip & Cargo'],
              [2, '2. Route & Checkpoints'],
              [3, '3. Vehicle, Driver & Confirm'],
            ].map(([n, label]) => (
              <div
                key={n}
                className={`px-3 py-1.5 rounded-lg border text-center font-semibold ${
                  step === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : step > (n as number)
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Location *
                  </label>
                  <Input
                    value={originAddress}
                    onChange={(e) => setOriginAddress(e.target.value)}
                    placeholder="e.g., Chennai Port, Tamil Nadu"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Destination Location *
                  </label>
                  <Input
                    value={destAddress}
                    onChange={(e) => setDestAddress(e.target.value)}
                    placeholder="e.g., Electronic City, Bengaluru"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Departure Date &amp; Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={departureAt}
                    onChange={(e) => setDepartureAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cargo Type
                  </label>
                  <select
                    value={cargoType}
                    onChange={(e) => setCargoType(e.target.value as CargoType)}
                    className="w-full h-9 px-2.5 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                  >
                    <option value="general">General Freight</option>
                    <option value="perishable">Perishable / Cold Chain</option>
                    <option value="hazardous">Hazardous Materials</option>
                    <option value="fragile">Fragile / High Value</option>
                    <option value="heavy_machinery">Heavy Machinery</option>
                    <option value="liquid_bulk">Liquid Bulk / Tanker</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cargo Weight (kg)
                  </label>
                  <Input
                    type="number"
                    min={100}
                    value={cargoWeightKg}
                    onChange={(e) => setCargoWeightKg(Number(e.target.value) || 0)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cargo Description &amp; Delivery Requirements
                  </label>
                  <Input
                    value={cargoDescription}
                    onChange={(e) => setCargoDescription(e.target.value)}
                    placeholder="Describe cargo & handling notes..."
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as DispatchPriority)}
                    className="w-full h-9 px-2.5 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent SLA</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Delivery Requirements
                  </label>
                  <Input
                    value={deliveryRequirements}
                    onChange={(e) => setDeliveryRequirements(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Simulation Speed (km/h)
                  </label>
                  <Input
                    type="number"
                    min={20}
                    max={120}
                    value={speedMultiplier}
                    onChange={(e) => setSpeedMultiplier(Number(e.target.value) || 60)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && preview && (
            <div className="space-y-4">
              {/* Calculated Route Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Route Distance</span>
                  <span className="font-bold text-slate-900 font-mono">{preview.distanceKm} km</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Est. Duration</span>
                  <span className="font-bold text-slate-900 font-mono">{preview.durationMinutes} min</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Est. Toll</span>
                  <span className="font-bold text-slate-900 font-mono">₹{preview.tollEstimateInr}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Route Risk</span>
                  <span className="font-bold text-slate-900 font-mono">{preview.riskScore}/100</span>
                </div>
              </div>

              {/* Checkpoint Count Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/60 border border-blue-200 rounded-xl p-3 text-xs">
                <div>
                  <span className="font-bold text-slate-900">Recommended Route Checkpoints</span>
                  <span className="text-slate-600 ml-2">
                    ({preview.routeGeometry.routing_source || 'OSRM'} corridor)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">Count:</span>
                  <select
                    value={checkpointCount}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCheckpointCount(next);
                      runRoutePreview(next);
                    }}
                    className="h-8 px-2 border border-slate-300 rounded bg-white text-xs font-semibold"
                  >
                    {[0, 2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} checkpoints
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ordered Checkpoint List */}
              <div className="space-y-2">
                {checkpoints.map((cp, idx) => (
                  <div
                    key={cp.id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{cp.label}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          +{cp.distanceFromPrevKm} km seg • {cp.cumulativeDistanceKm} km cum • ETA{' '}
                          {new Date(cp.plannedArrivalIso).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={cp.type}
                        onChange={(e) => {
                          const val = e.target.value as RecommendedCheckpointType;
                          setCheckpoints((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, type: val } : c)),
                          );
                        }}
                        className="h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-slate-50"
                      >
                        {CHECKPOINT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => moveCheckpoint(idx, -1)}
                        className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCheckpoint(idx, 1)}
                        className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCheckpoints((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                        title="Remove checkpoint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom Checkpoint */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-[11px] font-bold text-slate-700">Add Custom Checkpoint</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <Input
                    value={newCpLabel}
                    onChange={(e) => setNewCpLabel(e.target.value)}
                    placeholder="Checkpoint label"
                    className="text-xs h-8 sm:col-span-2"
                  />
                  <select
                    value={newCpType}
                    onChange={(e) => setNewCpType(e.target.value as RecommendedCheckpointType)}
                    className="h-8 px-2 text-xs border border-slate-200 rounded bg-white"
                  >
                    {CHECKPOINT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCustomCheckpoint}
                    className="h-8 text-xs bg-slate-800 hover:bg-slate-900 text-white gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Eligible Vehicle Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Truck className="w-4 h-4 text-blue-600" />
                  Select Eligible Vehicle ({eligibleVehicles.filter((v) => v.eligible).length} available)
                </label>
                {eligibleVehicles.filter((v) => v.eligible).length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      No eligible vehicles available for {cargoWeightKg} kg cargo. Complete an active trip or register a new vehicle in Fleet Registry.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {eligibleVehicles.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        disabled={!v.eligible}
                        onClick={() => setVehicleId(v.id)}
                        className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                          vehicleId === v.id
                            ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                            : v.eligible
                            ? 'border-slate-200 bg-white hover:border-slate-400'
                            : 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="font-mono">{v.registration_number}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {v.eligible ? 'AVAILABLE' : 'INELIGIBLE'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {v.vehicle_type} • Cap: {v.capacity_kg || 'N/A'} kg
                        </div>
                        {!v.eligible && v.ineligibilityReason && (
                          <div className="text-[10px] text-rose-600 mt-0.5">{v.ineligibilityReason}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Eligible Driver Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <User className="w-4 h-4 text-emerald-600" />
                  Select Eligible Driver ({eligibleDrivers.filter((d) => d.eligible).length} available)
                </label>
                {eligibleDrivers.filter((d) => d.eligible).length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      No eligible drivers available right now. End a completed trip or register a new driver in Fleet Registry.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {eligibleDrivers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        disabled={!d.eligible}
                        onClick={() => setDriverId(d.id)}
                        className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                          driverId === d.id
                            ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                            : d.eligible
                            ? 'border-slate-200 bg-white hover:border-slate-400'
                            : 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span>{d.user?.full_name || d.license_number}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {d.eligible ? 'AVAILABLE' : d.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                          Lic: {d.license_number} • Duty: {d.dutyHoursToday ?? 0}h
                        </div>
                        {!d.eligible && d.ineligibilityReason && (
                          <div className="text-[10px] text-rose-600 mt-0.5">{d.ineligibilityReason}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dispatch Summary Confirmation Card */}
              {preview && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Dispatch Summary &amp; Confirmation
                    </span>
                    <span className="font-mono text-blue-700">{preview.distanceKm} km</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                    <div>
                      <strong>Corridor:</strong> {preview.originLabel} → {preview.destinationLabel}
                    </div>
                    <div>
                      <strong>Planned / Predicted ETA:</strong>{' '}
                      {new Date(preview.plannedEtaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} /{' '}
                      {new Date(preview.predictedEtaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div>
                      <strong>Vehicle:</strong> {selectedVehicleObj?.registration_number || 'Select vehicle'}
                    </div>
                    <div>
                      <strong>Driver:</strong> {selectedDriverObj?.user?.full_name || selectedDriverObj?.license_number || 'Select driver'}
                    </div>
                    <div>
                      <strong>Cargo:</strong> {cargoType} ({cargoWeightKg} kg) • Priority: {priority.toUpperCase()}
                    </div>
                    <div>
                      <strong>Checkpoints / Toll:</strong> {checkpoints.length} stops • Est. ₹{preview.tollEstimateInr}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-1 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoStart}
                      onChange={(e) => setAutoStart(e.target.checked)}
                    />
                    Immediately start live telemetry, map tracking &amp; Digital Twin simulation
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              >
                ← Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {step === 1 && (
              <Button
                type="button"
                size="sm"
                disabled={previewLoading}
                onClick={handleNextToStep2}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {previewLoading ? 'Calculating Route...' : 'Calculate Route & Checkpoints →'}
              </Button>
            )}
            {step === 2 && (
              <Button
                type="button"
                size="sm"
                onClick={handleNextToStep3}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Select Vehicle &amp; Driver →
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting || !vehicleId || !driverId}
                onClick={handleConfirmDispatch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmitting ? 'Dispatching...' : 'Confirm & Dispatch Fleet'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
