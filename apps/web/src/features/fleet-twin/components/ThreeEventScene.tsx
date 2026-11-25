import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCw,
  Sun,
  Moon,
  Truck,
  Compass,
  Clock,
  Shield,
  Activity,
  User,
  X,
  CloudRain,
  Fuel,
  MapPin,
  AlertTriangle,
  Gauge,
  Zap,
  CheckCircle2,
  Navigation,
  Eye,
  Coffee,
} from 'lucide-react';
import {
  MockPredictionEvent,
  PredictionEventType,
  MockVehicle,
  MockRoute,
  MockCheckpoint,
  TruckType,
  MockReroute,
} from '@nexus-ways/shared';
import {
  build3DVehicle,
  dispose3DObject,
  Vehicle3DUserData,
} from './three-models/threeVehicleBuilders';
import { buildLogisticsEnvironment } from './three-models/threeEnvironmentBuilder';

export interface ThreeEventSceneProps {
  currentEvent?: MockPredictionEvent | null;
  events?: MockPredictionEvent[];
  vehicleRegistration?: string;
  onEventSelected?: (event: MockPredictionEvent) => void;
  // Enhanced fleet telemetry props
  vehicle?: MockVehicle;
  route?: MockRoute;
  checkpoints?: MockCheckpoint[];
  allVehicles?: MockVehicle[];
  onSelectVehicle?: (vehicle: MockVehicle) => void;
  activeReroute?: MockReroute | null;
  previewReroute?: MockReroute | null;
}

/**
 * 13-Step Dhaba Driver Rest Simulation Pose Generator
 * Calculates exact position, heading angle along tangent (atan2), speed, and step metadata.
 */
function getDhabaPose(phase: number): {
  x: number;
  z: number;
  heading: number;
  speedKmh: number;
  stepNumber: number;
  stepTitle: string;
  remainingMinutes: number;
} {
  // Phase ranges from 0 to 1 over the dhaba rest simulation cycle
  const p = Math.max(0, Math.min(1, phase));

  // Forward tangent sampling delta
  const dt = 0.003;
  const sample = (t: number): { x: number; z: number } => {
    if (t < 0.12) {
      // Step 1 & 2: Approach along highway and signal right exit
      const sub = t / 0.12;
      return {
        x: -110 + sub * 48, // -110 to -62
        z: 2.6 - sub * 1.6, // 2.6 to 1.0 (drifting toward exit lane)
      };
    } else if (t < 0.22) {
      // Step 3: Deceleration slip-ramp (curving from highway into dhaba apron)
      const sub = (t - 0.12) / 0.1;
      // Hermite/quadratic curve from (-62, 1.0) through (-55, -4.5) to (-48, -10)
      const x = -62 + sub * 14;
      const z = 1.0 - sub * 11;
      return { x, z };
    } else if (t < 0.3) {
      // Step 4: Apron entry (smooth transition into parking area)
      const sub = (t - 0.22) / 0.08;
      const x = -48 + sub * 8; // -48 to -40
      const z = -10 - sub * 4; // -10 to -14
      return { x, z };
    } else if (t < 0.38) {
      // Step 5 & 6: Maneuver into marked truck parking stall
      const sub = (t - 0.3) / 0.08;
      const x = -40 + sub * 8; // -40 to -32
      const z = -14;
      return { x, z };
    } else if (t < 0.72) {
      // Step 7, 8 & 9: Parked in stall at (-32, -14)
      return { x: -32, z: -14 };
    } else if (t < 0.8) {
      // Step 10 & 11: Rest complete, pre-trip check, pulling forward out of stall
      const sub = (t - 0.72) / 0.08;
      return {
        x: -32 + sub * 10, // -32 to -22
        z: -14,
      };
    } else if (t < 0.92) {
      // Step 12: Acceleration merge ramp (curving from apron back to highway)
      const sub = (t - 0.8) / 0.12;
      const x = -22 + sub * 20; // -22 to -2
      const z = -14 + sub * 16.6; // -14 to 2.6
      return { x, z };
    } else {
      // Step 13: Merge into highway mainline and accelerate to cruise
      const sub = (t - 0.92) / 0.08;
      return {
        x: -2 + sub * 32, // -2 to 30
        z: 2.6,
      };
    }
  };

  const currentPos = sample(p);
  const nextPos = sample(Math.min(1, p + dt));

  const dx = nextPos.x - currentPos.x;
  const dz = nextPos.z - currentPos.z;

  // Heading calculation: atan2(dx, dz) where +Z is the forward axis of the model
  let heading = Math.atan2(dx, dz);

  let speedKmh = 62;
  let stepNumber = 1;
  let stepTitle = 'Approaching Oasis Dhaba rest facility';
  let remainingMinutes = 45;

  if (p < 0.06) {
    stepNumber = 1;
    stepTitle = 'Step 1/13: Approaching Highway Dhaba Rest Stop';
    speedKmh = 62;
  } else if (p < 0.12) {
    stepNumber = 2;
    stepTitle = 'Step 2/13: Signaling Right & Shifting to Deceleration Lane';
    speedKmh = 52;
  } else if (p < 0.22) {
    stepNumber = 3;
    stepTitle = 'Step 3/13: Decelerating on Entry Slip Ramp';
    speedKmh = 35;
  } else if (p < 0.3) {
    stepNumber = 4;
    stepTitle = 'Step 4/13: Entering Dhaba Truck Parking Apron';
    speedKmh = 22;
  } else if (p < 0.35) {
    stepNumber = 5;
    stepTitle = 'Step 5/13: Maneuvering Toward Designated Parking Stall #2';
    speedKmh = 14;
  } else if (p < 0.38) {
    stepNumber = 6;
    stepTitle = 'Step 6/13: Aligning In Parking Bay & Applying Air Brakes';
    speedKmh = 6;
    // Align with stall angle (+15 deg)
    heading = Math.PI * 0.5 - 0.26;
  } else if (p < 0.72) {
    // Actively resting in stall
    const restProgress = (p - 0.38) / 0.34;
    remainingMinutes = Math.max(0, Math.round(45 * (1 - restProgress)));
    speedKmh = 0;
    heading = Math.PI * 0.5 - 0.26; // Parked in stall

    if (restProgress < 0.15) {
      stepNumber = 7;
      stepTitle = 'Step 7/13: Engine Cut • Parking Brakes Set • HOS Timer Started';
    } else if (restProgress < 0.85) {
      stepNumber = 8;
      stepTitle = `Step 8/13: Mandatory Driver Rest in Progress (${remainingMinutes}m remaining)`;
    } else {
      stepNumber = 9;
      stepTitle = `Step 9/13: Rest Period Concluding (${remainingMinutes}m remaining)`;
    }
  } else if (p < 0.76) {
    stepNumber = 10;
    stepTitle = 'Step 10/13: Rest Complete • Engine Started • Pre-Trip Inspection';
    speedKmh = 0;
    heading = Math.PI * 0.5;
    remainingMinutes = 0;
  } else if (p < 0.8) {
    stepNumber = 11;
    stepTitle = 'Step 11/13: Pulling Out of Stall into Parking Apron';
    speedKmh = 15;
    remainingMinutes = 0;
  } else if (p < 0.92) {
    stepNumber = 12;
    stepTitle = 'Step 12/13: Accelerating Along Exit Merge Ramp';
    speedKmh = 38;
    remainingMinutes = 0;
  } else {
    stepNumber = 13;
    stepTitle = 'Step 13/13: Merged into Highway Corridor • Resuming 65 km/h';
    speedKmh = 62;
    remainingMinutes = 0;
  }

  return {
    x: currentPos.x,
    z: currentPos.z,
    heading,
    speedKmh,
    stepNumber,
    stepTitle,
    remainingMinutes,
  };
}

export const ThreeEventScene: React.FC<ThreeEventSceneProps> = ({
  currentEvent,
  events = [],
  vehicleRegistration = 'TN 01 AB 1234',
  onEventSelected,
  vehicle,
  route,
  checkpoints = [],
  allVehicles = [],
  onSelectVehicle,
  activeReroute,
  previewReroute,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Time & Playback UI state
  const [isNightManual, setIsNightManual] = useState<boolean | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playSpeed, setPlaySpeed] = useState<1 | 5 | 10>(1);
  const [timelineHour, setTimelineHour] = useState<number>(0);

  // Dynamic Telemetry State for HUD
  const [selectedVehicleData, setSelectedVehicleData] = useState<MockVehicle | null>(null);
  const [hoveredVehicleReg, setHoveredVehicleReg] = useState<string | null>(null);
  const [activeFleetCount, setActiveFleetCount] = useState<number>(1);
  const [liveHeroSpeed, setLiveHeroSpeed] = useState<number>(62);
  const [liveHeroHeadingDeg, setLiveHeroHeadingDeg] = useState<number>(90);
  const [dhabaStepInfo, setDhabaStepInfo] = useState<{
    stepNumber: number;
    stepTitle: string;
    remainingMinutes: number;
  }>({
    stepNumber: 1,
    stepTitle: 'Approaching Oasis Dhaba rest facility',
    remainingMinutes: 45,
  });

  // Camera & Three.js refs
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const playSpeedRef = useRef(playSpeed);
  playSpeedRef.current = playSpeed;

  const lightsRef = useRef<{
    scene: THREE.Scene;
    ambientLight: THREE.AmbientLight;
    hemiLight: THREE.HemisphereLight;
    sunLight: THREE.DirectionalLight;
    streetPointLights: THREE.PointLight[];
    dhabaLight?: THREE.PointLight;
    yardLight?: THREE.PointLight;
  } | null>(null);

  // Camera orbit controls
  const orbitStateRef = useRef({
    isDragging: false,
    dragButton: 0,
    startX: 0,
    startY: 0,
    yaw: 0.65,
    pitch: 0.52,
    distance: 72,
    target: new THREE.Vector3(10, 2, 6),
  });

  // Effective event type
  const eventType: PredictionEventType = useMemo(() => {
    if (currentEvent) return currentEvent.event_type;
    return 'toll_delay';
  }, [currentEvent]);

  // Determine natural time of day from 0-48h horizon: starts at 08:00 AM IST
  const simulatedHourOfDay = useMemo(() => {
    return (8.0 + timelineHour) % 24;
  }, [timelineHour]);

  const autoIsNight = useMemo(() => {
    return simulatedHourOfDay >= 19.0 || simulatedHourOfDay < 5.5;
  }, [simulatedHourOfDay]);

  const isSunset = useMemo(() => {
    return simulatedHourOfDay >= 17.0 && simulatedHourOfDay < 19.0;
  }, [simulatedHourOfDay]);

  const effectiveIsNight = isNightManual !== null ? isNightManual : autoIsNight;

  const effectiveIsNightRef = useRef(effectiveIsNight);
  effectiveIsNightRef.current = effectiveIsNight;

  const isSunsetRef = useRef(isSunset);
  isSunsetRef.current = isSunset;

  // Dynamic Lighting Update (decoupled from scene re-construction)
  useEffect(() => {
    if (!lightsRef.current) return;
    const { scene, ambientLight, hemiLight, sunLight, streetPointLights, dhabaLight, yardLight } =
      lightsRef.current;
    const daySkyColor = new THREE.Color(0xdce7f3);
    const sunsetSkyColor = new THREE.Color(0x9a3412);
    const nightSkyColor = new THREE.Color(0x0a0f1d);

    scene.background = effectiveIsNight ? nightSkyColor : isSunset ? sunsetSkyColor : daySkyColor;
    if (scene.fog) {
      (scene.fog as THREE.FogExp2).color.setHex(
        effectiveIsNight ? 0x0a0f1d : isSunset ? 0x9a3412 : 0xdce7f3,
      );
      (scene.fog as THREE.FogExp2).density = effectiveIsNight ? 0.0045 : 0.0035;
    }

    ambientLight.color.setHex(effectiveIsNight ? 0x1e293b : isSunset ? 0xfdba74 : 0xffffff);
    ambientLight.intensity = effectiveIsNight ? 0.55 : isSunset ? 0.65 : 0.88;

    hemiLight.color.setHex(effectiveIsNight ? 0x1e3a8a : isSunset ? 0xf97316 : 0xbae6fd);
    hemiLight.groundColor.setHex(effectiveIsNight ? 0x020617 : isSunset ? 0x312e81 : 0x475569);
    hemiLight.intensity = effectiveIsNight ? 0.35 : isSunset ? 0.45 : 0.52;

    sunLight.color.setHex(effectiveIsNight ? 0x38bdf8 : isSunset ? 0xf59e0b : 0xfffaed);
    sunLight.intensity = effectiveIsNight ? 0.45 : isSunset ? 1.25 : 1.4;

    streetPointLights.forEach((light) => {
      light.intensity = effectiveIsNight ? 2.4 : isSunset ? 1.2 : 0.0;
    });
    if (dhabaLight) dhabaLight.intensity = effectiveIsNight ? 2.0 : isSunset ? 1.0 : 0.0;
    if (yardLight) yardLight.intensity = effectiveIsNight ? 1.8 : isSunset ? 0.9 : 0.0;
  }, [effectiveIsNight, isSunset]);

  // Differentiate state mode between Live Observed, Predicted Future, and What-If Simulated
  const twinStateMode = useMemo(() => {
    if (currentEvent?.provenance === 'SCENARIO') {
      return {
        label: 'WHAT-IF SIMULATED STATE',
        sub: `+${timelineHour.toFixed(1)}h Simulated`,
        color: 'bg-purple-50 text-purple-900 border-purple-200',
        dot: 'bg-purple-600',
      };
    }
    if (timelineHour > 0.5 || (currentEvent && currentEvent.hours_from_now > 0)) {
      return {
        label: 'PREDICTED FUTURE STATE',
        sub: `+${timelineHour.toFixed(1)}h Forecast`,
        color: 'bg-blue-50 text-blue-900 border-blue-200',
        dot: 'bg-blue-600',
      };
    }
    return {
      label: 'LIVE OBSERVED STATE',
      sub: 'Real Telemetry',
      color: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }, [timelineHour, currentEvent]);

  // Keep selected vehicle in sync with prop if updated
  useEffect(() => {
    if (vehicle) {
      setSelectedVehicleData(vehicle);
    }
  }, [vehicle]);

  // Simulation Clock & Timeline Scrubber Loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimelineHour((prev) => {
        const next = prev + 0.12 * playSpeed;
        if (next >= 48) {
          return 0;
        }
        // Check if an event matches this hour
        if (events.length > 0 && onEventSelected) {
          const matched = events.find((e) => Math.abs(e.hours_from_now - next) < 0.9);
          if (matched && matched.id !== currentEvent?.id) {
            onEventSelected(matched);
          }
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, events, currentEvent, onEventSelected]);

  // Main Three.js Scene Setup & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const daySkyColor = new THREE.Color(0xdce7f3);
    const sunsetSkyColor = new THREE.Color(0x9a3412);
    const nightSkyColor = new THREE.Color(0x0a0f1d);

    const initialSky = effectiveIsNight
      ? nightSkyColor
      : isSunset
        ? sunsetSkyColor
        : daySkyColor;
    scene.background = initialSky;
    scene.fog = new THREE.FogExp2(
      effectiveIsNight ? 0x0a0f1d : isSunset ? 0x9a3412 : 0xdce7f3,
      effectiveIsNight ? 0.0045 : 0.0035,
    );

    // 2. Camera (Isometric Perspective Setup)
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(38, aspect, 1, 600);
    cameraRef.current = camera;

    const updateCameraPos = () => {
      const { yaw, pitch, distance, target } = orbitStateRef.current;
      const x = target.x + distance * Math.cos(pitch) * Math.sin(yaw);
      const y = target.y + distance * Math.sin(pitch);
      const z = target.z + distance * Math.cos(pitch) * Math.cos(yaw);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    };
    updateCameraPos();

    // 3. Renderer with calibrated tone mapping
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    rendererRef.current = renderer;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    // 4. Calibrated Multi-Source Lighting
    const ambientLight = new THREE.AmbientLight(
      effectiveIsNight ? 0x1e293b : isSunset ? 0xfdba74 : 0xffffff,
      effectiveIsNight ? 0.55 : isSunset ? 0.65 : 0.88,
    );
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      effectiveIsNight ? 0x1e3a8a : isSunset ? 0xf97316 : 0xbae6fd,
      effectiveIsNight ? 0x020617 : isSunset ? 0x312e81 : 0x475569,
      effectiveIsNight ? 0.35 : isSunset ? 0.45 : 0.52,
    );
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
      effectiveIsNight ? 0x38bdf8 : isSunset ? 0xf59e0b : 0xfffaed,
      effectiveIsNight ? 0.45 : isSunset ? 1.25 : 1.4,
    );
    sunLight.position.set(45, 60, 35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 180;
    const d = 65;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // 5. Environment (Ground, Roads, Markings, Warehouse, Fuel Station, Toll, Dhaba, Streetlamps)
    const {
      environmentGroup,
      streetLamps,
      streetPointLights,
      tollBoom,
      tollLaser,
      tollLeds,
      dockDoors,
      dhabaLight,
      yardLight,
    } = buildLogisticsEnvironment();
    scene.add(environmentGroup);

    // Apply night illumination to streetlamps & facility lights
    streetPointLights.forEach((pl) => {
      pl.intensity = effectiveIsNight || isSunset ? 2.2 : 0;
    });
    dhabaLight.intensity = effectiveIsNight || isSunset ? 2.5 : 0.4;
    yardLight.intensity = effectiveIsNight || isSunset ? 2.5 : 0;

    lightsRef.current = {
      scene,
      ambientLight,
      hemiLight,
      sunLight,
      streetPointLights,
      dhabaLight,
      yardLight,
    };

    // 6. Rain Particle System (for weather events)
    let rainParticles: THREE.Points | null = null;
    const rainCount = 700;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 180;
      rainPositions[i + 1] = Math.random() * 55;
      rainPositions[i + 2] = (Math.random() - 0.5) * 180;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.38,
      transparent: true,
      opacity: 0.65,
    });
    rainParticles = new THREE.Points(rainGeo, rainMat);
    if (eventType === 'weather') {
      scene.add(rainParticles);
    }

    // 7. Active Fleet Vehicles Collection
    const vehicleMeshes: THREE.Group[] = [];
    const activeVehiclesList: MockVehicle[] = [];

    // Hero vehicle setup
    const heroVehicleData: MockVehicle =
      vehicle ||
      ({
        id: 'hero-1',
        fleet_id: 'fleet-1',
        registration_number: vehicleRegistration,
        truck_type: '32ft_mxl',
        capacity_tons: 25,
        fuel_type: 'Diesel',
        current_load_tons: 18.5,
        status: 'en_route',
        current_lat: 19.076,
        current_lng: 72.8777,
        progress_pct: 35,
        speed_kmh: 62,
        driver_id: 'd-1',
        route_id: 'r-1',
        is_mock: true,
        seed_batch_id: 'batch-1',
        created_at: new Date().toISOString(),
        driver: {
          id: 'd-1',
          name: 'Rajesh Kumar',
          phone: '+91 98765 43210',
          license_number: 'DL-IND-092834',
          license_type: 'HMV',
          experience_years: 8,
          rating: 4.8,
          shift_start: new Date().toISOString(),
          hours_driven_today: 3.5,
          max_daily_hours: 10,
          rest_hours_compliance: 'compliant',
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
        },
        route: {
          id: 'r-1',
          name: 'Golden Corridor NH-48',
          corridor: 'Mumbai-Bengaluru Corridor',
          origin_city: 'Mumbai',
          destination_city: 'Bengaluru',
          total_distance_km: 984,
          base_duration_hours: 18,
          planned_departure: new Date().toISOString(),
          planned_eta: new Date().toISOString(),
          highway_numbers: ['NH-48'],
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
        },
      } as MockVehicle);
    activeVehiclesList.push(heroVehicleData);

    // Populate peer fleets
    if (allVehicles.length > 0) {
      allVehicles.forEach((v) => {
        if (v.registration_number !== heroVehicleData.registration_number) {
          activeVehiclesList.push(v);
        }
      });
    } else {
      // Create rich peer fleet trucks operating simultaneously
      activeVehiclesList.push(
        {
          id: 'fleet-2',
          fleet_id: 'fleet-2',
          registration_number: 'KA 04 MX 8821',
          truck_type: 'container_carrier' as TruckType,
          capacity_tons: 30,
          fuel_type: 'Diesel',
          current_load_tons: 22,
          status: 'en_route',
          speed_kmh: 58,
          current_lat: 18.5204,
          current_lng: 73.8567,
          progress_pct: 68,
          driver_id: 'd-2',
          route_id: 'r-2',
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
          driver: {
            id: 'd-2',
            name: 'Gurmeet Singh',
            phone: '+91 98111 22334',
            license_number: 'DL-PUN-77123',
            license_type: 'HMV',
            experience_years: 12,
            rating: 4.9,
            shift_start: new Date().toISOString(),
            hours_driven_today: 5.2,
            max_daily_hours: 10,
            rest_hours_compliance: 'compliant',
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
          route: {
            id: 'r-2',
            name: 'Pune-Chennai Express',
            corridor: 'Pune-Bengaluru NH-48',
            origin_city: 'Pune',
            destination_city: 'Chennai',
            total_distance_km: 840,
            base_duration_hours: 16,
            planned_departure: new Date().toISOString(),
            planned_eta: new Date().toISOString(),
            highway_numbers: ['NH-48'],
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
        } as MockVehicle,
        {
          id: 'fleet-3',
          fleet_id: 'fleet-3',
          registration_number: 'MH 12 QZ 4490',
          truck_type: 'tanker' as TruckType,
          capacity_tons: 28,
          fuel_type: 'LNG',
          current_load_tons: 26,
          status: 'en_route',
          speed_kmh: 52,
          current_lat: 15.3173,
          current_lng: 75.7139,
          progress_pct: 22,
          driver_id: 'd-3',
          route_id: 'r-3',
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
          driver: {
            id: 'd-3',
            name: 'Sunil Patil',
            phone: '+91 98222 33445',
            license_number: 'DL-MAH-88231',
            license_type: 'HMV_HGMV',
            experience_years: 9,
            rating: 4.7,
            shift_start: new Date().toISOString(),
            hours_driven_today: 2.1,
            max_daily_hours: 10,
            rest_hours_compliance: 'compliant',
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
          route: {
            id: 'r-3',
            name: 'Western Energy Haul',
            corridor: 'Surat-Mumbai Petroleum Route',
            origin_city: 'Surat',
            destination_city: 'Mumbai',
            total_distance_km: 290,
            base_duration_hours: 6,
            planned_departure: new Date().toISOString(),
            planned_eta: new Date().toISOString(),
            highway_numbers: ['NH-48'],
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
        } as MockVehicle,
        {
          id: 'fleet-4',
          fleet_id: 'fleet-4',
          registration_number: 'DL 01 TC 9012',
          truck_type: 'refrigerated' as TruckType,
          capacity_tons: 20,
          fuel_type: 'Diesel',
          current_load_tons: 14,
          status: 'en_route',
          speed_kmh: 65,
          current_lat: 13.0827,
          current_lng: 80.2707,
          progress_pct: 88,
          driver_id: 'd-4',
          route_id: 'r-4',
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
          driver: {
            id: 'd-4',
            name: 'Vikram Joshi',
            phone: '+91 98333 44556',
            license_number: 'DL-DEL-55612',
            license_type: 'HMV',
            experience_years: 6,
            rating: 4.85,
            shift_start: new Date().toISOString(),
            hours_driven_today: 4.8,
            max_daily_hours: 10,
            rest_hours_compliance: 'compliant',
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
          route: {
            id: 'r-4',
            name: 'Cold-Chain Pharma Fast-Track',
            corridor: 'Hyderabad-Bengaluru Expressway',
            origin_city: 'Hyderabad',
            destination_city: 'Bengaluru',
            total_distance_km: 570,
            base_duration_hours: 10,
            planned_departure: new Date().toISOString(),
            planned_eta: new Date().toISOString(),
            highway_numbers: ['NH-44'],
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
        } as MockVehicle,
        {
          id: 'fleet-5',
          fleet_id: 'fleet-5',
          registration_number: 'HR 26 EX 3110',
          truck_type: '20ft_container' as TruckType,
          capacity_tons: 10,
          fuel_type: 'Electric',
          current_load_tons: 6.2,
          status: 'idle',
          speed_kmh: 0,
          current_lat: 12.9716,
          current_lng: 77.5946,
          progress_pct: 99,
          driver_id: 'd-5',
          route_id: 'r-5',
          is_mock: true,
          seed_batch_id: 'batch-1',
          created_at: new Date().toISOString(),
          driver: {
            id: 'd-5',
            name: 'Amit Verma',
            phone: '+91 98444 55667',
            license_number: 'DL-HAR-11234',
            license_type: 'HMV',
            experience_years: 4,
            rating: 4.6,
            shift_start: new Date().toISOString(),
            hours_driven_today: 1.5,
            max_daily_hours: 10,
            rest_hours_compliance: 'compliant',
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
          route: {
            id: 'r-5',
            name: 'Urban Last-Mile Dispatch',
            corridor: 'Bengaluru Intra-Hub Delivery',
            origin_city: 'Peenya Hub',
            destination_city: 'Whitefield Depot',
            total_distance_km: 45,
            base_duration_hours: 2,
            planned_departure: new Date().toISOString(),
            planned_eta: new Date().toISOString(),
            highway_numbers: ['Outer Ring Road'],
            is_mock: true,
            seed_batch_id: 'batch-1',
            created_at: new Date().toISOString(),
          },
        } as MockVehicle,
      );
    }

    setActiveFleetCount(activeVehiclesList.length);

    // Build 3D models for all active fleets
    activeVehiclesList.forEach((vData) => {
      const vMesh = build3DVehicle(vData);
      scene.add(vMesh);
      vehicleMeshes.push(vMesh);
    });

    // 8. Animation & Movement Loop
    const clock = new THREE.Clock();
    let simTime = 0;
    let lastHudUpdateTime = 0;
    let currentHeroSpeed = 62;
    let currentHeroHeading = 90;
    let currentDhabaInfo: {
      stepNumber: number;
      stepTitle: string;
      remainingMinutes: number;
    } | null = null;

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      simTime += delta * playSpeedRef.current;

      // Update rain particle system
      if (rainParticles && eventType === 'weather') {
        const posAttr = rainParticles.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 1; i < rainPositions.length; i += 3) {
          rainPositions[i] -= delta * 38;
          if (rainPositions[i] < 0) {
            rainPositions[i] = 52;
          }
        }
        posAttr.needsUpdate = true;
      }

      // Update toll plaza FASTag cycle
      const tollCycle = Math.sin(simTime * 1.6);
      const isGateOpen = tollCycle > 0.15;
      tollBoom.rotation.z = isGateOpen ? Math.PI * 0.28 : 0;
      tollLaser.visible = eventType === 'toll_delay' && !isGateOpen;
      if (tollLeds.length > 0) {
        tollLeds.forEach((led) => {
          const mat = led.material as THREE.MeshBasicMaterial;
          mat.color.setHex(isGateOpen ? 0x22c55e : 0xef4444);
        });
      }

      // ----------------------------------------------------
      // Vehicle Movement & Strict Road Tangent Heading Math
      // ----------------------------------------------------
      const isNight = effectiveIsNightRef.current;
      const isSunsetNow = isSunsetRef.current;

      vehicleMeshes.forEach((mesh, idx) => {
        const userData = mesh.userData as Vehicle3DUserData;
        const vData = userData.vehicleData;
        const speedKmh = vData?.speed_kmh || 58;

        const isHero = idx === 0;

        if (isHero) {
          if (eventType === 'driver_break') {
            // Full 13-step Dhaba rest simulation
            const cycleDuration = 32.0; // seconds for full 13-step progression
            const dhabaPhase = (simTime % cycleDuration) / cycleDuration;
            const pose = getDhabaPose(dhabaPhase);

            mesh.position.set(pose.x, 0, pose.z);
            mesh.rotation.y = pose.heading;

            currentHeroSpeed = pose.speedKmh;
            currentHeroHeading = Math.round(((pose.heading * 180) / Math.PI + 360) % 360);
            currentDhabaInfo = {
              stepNumber: pose.stepNumber,
              stepTitle: pose.stepTitle,
              remainingMinutes: pose.remainingMinutes,
            };

            // Wheel roll
            if (pose.speedKmh > 0) {
              userData.wheels.forEach((w) => {
                w.rotation.x += delta * pose.speedKmh * 0.1 * playSpeedRef.current;
              });
            }
          } else if (eventType === 'toll_delay') {
            // Toll booth approach, scan halt at x = 79, and departure
            const span = 250;
            const basePos = ((simTime * 9.5) % span) - 110;
            const isNearToll = basePos >= 72 && basePos <= 83;
            const heroX = isNearToll && !isGateOpen ? 79 : basePos;
            mesh.position.set(heroX, 0, 2.6);

            // Crucial: Eastbound road tangent is (dx=1, dz=0) -> atan2(1, 0) = PI/2 (90 deg)
            mesh.rotation.y = Math.PI * 0.5;

            currentHeroSpeed = heroX === 79 ? 0 : 58;
            currentHeroHeading = 90;

            if (currentHeroSpeed > 0) {
              userData.wheels.forEach((w) => {
                w.rotation.x += delta * currentHeroSpeed * 0.1 * playSpeedRef.current;
              });
            }
          } else if (eventType === 'ghat_slowdown') {
            // Mountain Ghat winding section with authentic S-curve steering
            const cycleX = ((simTime * 32 * 0.1) % 260) - 130;
            const curveZ = 2.6 + Math.sin(cycleX * 0.08) * 1.4;

            // Instantaneous road tangent
            const dx = 1.0;
            const dz = Math.cos(cycleX * 0.08) * 1.4 * 0.08;
            const targetHeading = Math.atan2(dx, dz);

            mesh.position.set(cycleX, 0, curveZ);
            mesh.rotation.y = targetHeading;

            currentHeroSpeed = 32;
            currentHeroHeading = Math.round(((targetHeading * 180) / Math.PI + 360) % 360);

            userData.wheels.forEach((w) => {
              w.rotation.x += delta * 32 * 0.1 * playSpeedRef.current;
            });
          } else if (eventType === 'weather') {
            // Weather slowdown
            const cycleX = ((simTime * 42 * 0.1) % 260) - 130;
            mesh.position.set(cycleX, 0, 2.6);
            mesh.rotation.y = Math.PI * 0.5; // Eastbound
            currentHeroSpeed = 42;
            currentHeroHeading = 90;

            userData.wheels.forEach((w) => {
              w.rotation.x += delta * 42 * 0.1 * playSpeedRef.current;
            });
          } else {
            // Normal highway cruise Eastbound
            const cycleX = ((simTime * speedKmh * 0.1) % 260) - 130;
            mesh.position.set(cycleX, 0, 2.6);
            mesh.rotation.y = Math.PI * 0.5; // Facing East strictly along road
            currentHeroSpeed = speedKmh;
            currentHeroHeading = 90;

            userData.wheels.forEach((w) => {
              w.rotation.x += delta * speedKmh * 0.1 * playSpeedRef.current;
            });
          }
        } else if (idx === 1) {
          // Peer 1: Container carrier traveling Westbound on opposite lane (z = -2.6)
          // Westbound road tangent is (dx=-1, dz=0) -> atan2(-1, 0) = -PI/2 (-90 deg)
          const cycleX = 130 - ((simTime * 56 * 0.09 + 35) % 260);
          mesh.position.set(cycleX, 0, -2.6);
          mesh.rotation.y = -Math.PI * 0.5; // Strictly facing West (opposite direction)

          userData.wheels.forEach((w) => {
            w.rotation.x += delta * 56 * 0.09 * playSpeedRef.current;
          });
        } else if (idx === 2) {
          // Peer 2: Tanker traveling Eastbound in slow lane (z = 4.2)
          const cycleX = ((simTime * 48 * 0.08 + 110) % 260) - 130;
          mesh.position.set(cycleX, 0, 4.2);
          mesh.rotation.y = Math.PI * 0.5; // Strictly facing East

          userData.wheels.forEach((w) => {
            w.rotation.x += delta * 48 * 0.08 * playSpeedRef.current;
          });
        } else if (idx === 3) {
          // Peer 3: Refrigerated Truck traveling Westbound on passing lane (z = -4.2)
          const cycleX = 125 - ((simTime * 64 * 0.1 + 170) % 260);
          mesh.position.set(cycleX, 0, -4.2);
          mesh.rotation.y = -Math.PI * 0.5; // Strictly facing West

          userData.wheels.forEach((w) => {
            w.rotation.x += delta * 64 * 0.1 * playSpeedRef.current;
          });
        } else if (idx === 4) {
          // Peer 4: Delivery truck backed into warehouse loading bay #2 (x = 35 - 2.9, z = 52 + 10)
          mesh.position.set(35 - 2.9, 0, 52 + 9.5);
          mesh.rotation.y = 0; // Backed up against the dock door
        }

        // Night / Sunset Headlights & Taillights Intensity
        if (userData.headlightSpot) {
          userData.headlightSpot.intensity =
            isNight || isSunsetNow || eventType === 'weather' ? 3.4 : 0.6;
        }
        if (userData.headlightCones) {
          userData.headlightCones.forEach((c) => {
            c.visible = isNight || isSunsetNow || eventType === 'weather';
            if (c.material) {
              (c.material as THREE.MeshBasicMaterial).opacity = isNight
                ? 0.16
                : isSunsetNow
                  ? 0.1
                  : 0.14;
            }
          });
        }
        if (userData.rearPointLight) {
          userData.rearPointLight.intensity = isNight || isSunsetNow ? 1.0 : 0.2;
        }
      });

      // Throttle React HUD state updates to 4Hz (every 250ms) to prevent 60fps main thread thrashing
      const now = performance.now();
      if (now - lastHudUpdateTime > 250) {
        lastHudUpdateTime = now;
        setLiveHeroSpeed(currentHeroSpeed);
        setLiveHeroHeadingDeg(currentHeroHeading);
        if (currentDhabaInfo) {
          setDhabaStepInfo(currentDhabaInfo);
        }
      }

      // Render scene
      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 10. Pointer Interactions (Orbit / Pan / Zoom / Raycasting)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e: MouseEvent) => {
      orbitStateRef.current.isDragging = true;
      orbitStateRef.current.dragButton = e.button;
      orbitStateRef.current.startX = e.clientX;
      orbitStateRef.current.startY = e.clientY;
    };

    const onPointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (orbitStateRef.current.isDragging) {
        const dx = e.clientX - orbitStateRef.current.startX;
        const dy = e.clientY - orbitStateRef.current.startY;
        orbitStateRef.current.startX = e.clientX;
        orbitStateRef.current.startY = e.clientY;

        if (orbitStateRef.current.dragButton === 0) {
          // Orbit
          orbitStateRef.current.yaw -= dx * 0.006;
          orbitStateRef.current.pitch = Math.max(
            0.15,
            Math.min(1.45, orbitStateRef.current.pitch + dy * 0.005),
          );
        } else if (orbitStateRef.current.dragButton === 2) {
          // Pan
          const panSpeed = orbitStateRef.current.distance * 0.0012;
          const { yaw } = orbitStateRef.current;
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

          orbitStateRef.current.target.addScaledVector(right, -dx * panSpeed);
          orbitStateRef.current.target.addScaledVector(forward, dy * panSpeed);
        }
        updateCameraPos();
      } else {
        // Raycast hover check
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(vehicleMeshes, true);
        if (intersects.length > 0) {
          canvas.style.cursor = 'pointer';
          let cur: THREE.Object3D | null = intersects[0].object;
          while (cur && !cur.userData?.vehicleId) {
            cur = cur.parent;
          }
          if (cur && cur.userData?.registrationNumber) {
            setHoveredVehicleReg(cur.userData.registrationNumber);
          }
        } else {
          canvas.style.cursor = 'grab';
          setHoveredVehicleReg(null);
        }
      }
    };

    const onPointerUp = (e: MouseEvent) => {
      const dist = Math.hypot(
        e.clientX - orbitStateRef.current.startX,
        e.clientY - orbitStateRef.current.startY,
      );
      if (dist < 4) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(vehicleMeshes, true);
        if (intersects.length > 0) {
          let cur: THREE.Object3D | null = intersects[0].object;
          while (cur && !cur.userData?.vehicleId) {
            cur = cur.parent;
          }
          if (cur && cur.userData?.vehicleData) {
            const clickedData = cur.userData.vehicleData as MockVehicle;
            setSelectedVehicleData(clickedData);
            if (onSelectVehicle) {
              onSelectVehicle(clickedData);
            }
            orbitStateRef.current.target.copy(cur.position);
            updateCameraPos();
          }
        }
      }
      orbitStateRef.current.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitStateRef.current.distance = Math.max(
        18,
        Math.min(145, orbitStateRef.current.distance + e.deltaY * 0.05),
      );
      updateCameraPos();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // Page Visibility API: pause animation loop when backgrounded
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
      } else {
        clock.getDelta(); // flush delta
        if (!animFrameIdRef.current) {
          animFrameIdRef.current = requestAnimationFrame(animate);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      lightsRef.current = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);

      vehicleMeshes.forEach((mesh) => dispose3DObject(mesh));
      dispose3DObject(environmentGroup);
      if (rainParticles) {
        rainParticles.geometry.dispose();
        (rainParticles.material as THREE.Material).dispose();
      }
      renderer.dispose();
    };
  }, [eventType, vehicleRegistration, vehicle, allVehicles]);

  // Reset Camera View
  const handleResetCamera = useCallback(() => {
    orbitStateRef.current.yaw = 0.65;
    orbitStateRef.current.pitch = 0.52;
    orbitStateRef.current.distance = 72;
    orbitStateRef.current.target.set(10, 2, 6);
    if (cameraRef.current) {
      const { yaw, pitch, distance, target } = orbitStateRef.current;
      const x = target.x + distance * Math.cos(pitch) * Math.sin(yaw);
      const y = target.y + distance * Math.sin(pitch);
      const z = target.z + distance * Math.cos(pitch) * Math.cos(yaw);
      cameraRef.current.position.set(x, y, z);
      cameraRef.current.lookAt(target);
    }
  }, []);

  // Format time of day display (e.g., 08:30 AM IST)
  const formattedTimeOfDay = useMemo(() => {
    const hours = Math.floor(simulatedHourOfDay);
    const minutes = Math.floor((simulatedHourOfDay - hours) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const mStr = minutes.toString().padStart(2, '0');
    return `${h12}:${mStr} ${ampm} IST`;
  }, [simulatedHourOfDay]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[520px] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-200/90 select-none"
    >
      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Top HUD Controls Overlay */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Main Title Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 text-xs font-bold text-slate-900 flex items-center gap-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono tracking-tight">3D LOGISTICS DIGITAL TWIN</span>
          </div>

          {/* Explicit State Provenance Badge (Live vs Future vs Scenario) */}
          <div
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-xs ${twinStateMode.color}`}
          >
            <span className={`w-2 h-2 rounded-full ${twinStateMode.dot}`} />
            <span>{twinStateMode.label}</span>
            <span className="opacity-75 font-normal">({twinStateMode.sub})</span>
          </div>

          {/* Alternate Corridor Dual-Route Indicator */}
          {(previewReroute || activeReroute) && (
            <div
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-xs ${
                activeReroute?.accepted
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-indigo-50 text-indigo-800 border-indigo-300 animate-pulse'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                {activeReroute?.accepted ? 'ACTIVE REROUTE:' : 'CORRIDOR PREVIEW:'}{' '}
                {(previewReroute || activeReroute)?.alternate_corridor || 'NE-5 Corridor'}
              </span>
              <span className="text-[10px] bg-white/90 text-emerald-700 font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                -{(previewReroute || activeReroute)?.time_saved_minutes}m
              </span>
            </div>
          )}

          {/* Event Badge */}
          <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50/95 backdrop-blur-md px-2.5 py-1 rounded-lg border border-blue-200 shadow-xs uppercase">
            {eventType.replace('_', ' ')}
          </span>

          {/* Time of Day & Lighting Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200/90 text-[11px] font-mono font-semibold text-slate-700 shadow-xs">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>{formattedTimeOfDay}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase">
              {effectiveIsNight ? 'Night Mode' : isSunset ? 'Sunset' : 'Day Mode'}
            </span>
          </div>

          {/* Hovered Vehicle Quick Tag */}
          {hoveredVehicleReg && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-mono border border-slate-700 animate-in fade-in duration-200 shadow-md">
              <Truck className="w-3 h-3 text-blue-400" />
              <span>{hoveredVehicleReg} (Click to inspect)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Day / Night Manual Toggle */}
          <button
            onClick={() => setIsNightManual((prev) => (prev === null ? !autoIsNight : !prev))}
            title={effectiveIsNight ? 'Switch to Day Light' : 'Switch to Night Illumination'}
            className="p-2 rounded-xl bg-white/95 hover:bg-slate-50 border border-slate-200/90 text-slate-700 transition-colors shadow-sm cursor-pointer"
          >
            {effectiveIsNight ? (
              <Sun className="w-4 h-4 text-amber-500 fill-amber-500/20" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600 fill-indigo-600/20" />
            )}
          </button>

          {/* Reset Camera */}
          <button
            onClick={handleResetCamera}
            title="Reset Isometric Camera Angle"
            className="p-2 rounded-xl bg-white/95 hover:bg-slate-50 border border-slate-200/90 text-slate-700 transition-colors shadow-sm cursor-pointer"
          >
            <RotateCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Floating 3D Telemetry HUD Card (Section 11) */}
      {selectedVehicleData && (
        <div className="absolute top-16 left-3 w-84 max-w-[calc(100%-24px)] bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-slate-200/90 shadow-2xl text-slate-900 z-20 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Header */}
          <div className="flex items-start justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-xs">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <div className="font-mono font-black text-sm text-slate-900 tracking-tight">
                  {selectedVehicleData.registration_number}
                </div>
                <div className="text-[11px] text-slate-500 capitalize font-medium">
                  {selectedVehicleData.truck_type.replace('_', ' ')} • {selectedVehicleData.status.replace('_', ' ')}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedVehicleData(null)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Operational Status Pill if on Dhaba break */}
          {eventType === 'driver_break' && (
            <div className="my-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs">
              <div className="flex items-center justify-between font-bold text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-amber-600" />
                  <span>Dhaba Rest Simulation</span>
                </div>
                <span className="font-mono bg-amber-200/70 text-amber-900 px-1.5 py-0.2 rounded">
                  {dhabaStepInfo.remainingMinutes}m Rest Left
                </span>
              </div>
              <div className="text-[11px] font-medium text-amber-800 mt-1 leading-snug">
                {dhabaStepInfo.stepTitle}
              </div>
            </div>
          )}

          {/* Grid Telemetry Metrics */}
          <div className="grid grid-cols-2 gap-2 my-2.5 text-xs">
            {/* Speed with Live Gauge */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Speed</span>
                <Gauge className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="font-mono font-black text-sm text-slate-900 mt-0.5">
                {selectedVehicleData.id === 'hero-1' || !selectedVehicleData.id
                  ? liveHeroSpeed
                  : selectedVehicleData.speed_kmh}{' '}
                km/h
              </div>
            </div>

            {/* Heading Angle & Compass */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Road Heading</span>
                <Compass className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="font-mono font-black text-sm text-emerald-600 mt-0.5">
                {selectedVehicleData.id === 'hero-1' || !selectedVehicleData.id
                  ? liveHeroHeadingDeg
                  : 90}
                ° (Locked)
              </div>
            </div>

            {/* Progress % */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Journey Progress</span>
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                {Math.min(
                  99,
                  Math.round(
                    selectedVehicleData.progress_pct + (timelineHour / 48) * (100 - selectedVehicleData.progress_pct),
                  ),
                )}
                %
              </div>
            </div>

            {/* Fuel & Range */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Fuel Level</span>
                <Fuel className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                {Math.max(15, Math.round(78 - (timelineHour / 48) * 35))}% (Diesel)
              </div>
            </div>

            {/* Corridor Route */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 col-span-2">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Logistics Corridor</span>
                <Navigation className="w-3 h-3 text-slate-400" />
              </div>
              <div className="font-semibold text-slate-800 text-xs truncate mt-0.5">
                {selectedVehicleData.route?.corridor || 'Golden Corridor NH-48'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                <span>
                  {selectedVehicleData.route?.origin_city || 'Mumbai'} →{' '}
                  {selectedVehicleData.route?.destination_city || 'Bengaluru'}
                </span>
              </div>
            </div>

            {/* Driver & Rest Compliance */}
            {selectedVehicleData.driver && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 col-span-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500">Driver & HOS Duty</div>
                  <div className="font-semibold text-slate-800 text-xs mt-0.5">
                    {selectedVehicleData.driver.name}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {selectedVehicleData.driver.rest_hours_compliance}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    {selectedVehicleData.driver.hours_driven_today || 3.5}/10h driven
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Data Disclosure Notice (Section 15 Scenario 9) */}
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-blue-600">
              <Zap className="w-3 h-3" />
              PREDICTIVE TWIN STATE
            </span>
            <span className="font-mono text-slate-400">94.8% SLA Confidence</span>
          </div>
        </div>
      )}

      {/* Bottom Simulation Scrubber & 48-Hour Horizon Playback Bar */}
      <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-slate-900 shadow-xl z-10">
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md shadow-blue-500/25 cursor-pointer active:scale-95"
            title={isPlaying ? 'Pause Simulation' : 'Play 48h Future Trajectory'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Time Horizon Info */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-xs text-blue-700">
                +{timelineHour.toFixed(1)}h Future Horizon
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {activeFleetCount} Active Fleets
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate max-w-[240px] sm:max-w-xs mt-0.5">
              {currentEvent ? currentEvent.location_name : 'National Freight Logistics Corridor'}
            </div>
          </div>
        </div>

        {/* 48h Interactive Range Scrubber */}
        <div className="hidden lg:flex items-center gap-2 flex-1 max-w-xs mx-4">
          <span className="text-[10px] font-mono text-slate-500">0h</span>
          <input
            type="range"
            min="0"
            max="48"
            step="0.5"
            value={timelineHour}
            onChange={(e) => setTimelineHour(parseFloat(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
          />
          <span className="text-[10px] font-mono text-slate-500">48h</span>
        </div>

        {/* Playback Speed Toggles */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          {([1, 5, 10] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setPlaySpeed(spd)}
              className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-all cursor-pointer ${
                playSpeed === spd
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Camera interaction tips */}
        <div className="text-[11px] text-slate-500 font-medium hidden xl:flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-blue-600" />
          <span>Left-drag to orbit • Right-drag to pan • Scroll to zoom • Click truck to inspect</span>
        </div>
      </div>
    </div>
  );
};
