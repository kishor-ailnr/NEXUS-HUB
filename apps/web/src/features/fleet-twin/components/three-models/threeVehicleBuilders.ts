import * as THREE from 'three';
import { MockVehicle } from '@nexus-ways/shared';

export interface Vehicle3DUserData {
  vehicleId: string;
  registrationNumber: string;
  truckType: string;
  vehicleData?: MockVehicle;
  wheels: THREE.Mesh[];
  headlights: THREE.Mesh[];
  headlightSpot?: THREE.SpotLight;
  headlightCones?: THREE.Mesh[];
  taillights: THREE.Mesh[];
  rearPointLight?: THREE.PointLight;
  baseY: number;
  forwardAxis: 'z'; // Explicit forward direction of the model is +Z
}

// Low-poly shared palette with calibrated reflectance
const PALETTE = {
  cabColors: [0x2563eb, 0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0891b2, 0xe11d48],
  chassis: 0x1e293b,
  darkTrim: 0x0f172a,
  chrome: 0xe2e8f0,
  glass: 0x1e293b,
  rubber: 0x18181b,
  rim: 0xcfd8dc,
  headlightOff: 0xfef08a,
  headlightGlow: 0xfffbeb,
  taillightOff: 0x991b1b,
  taillightGlow: 0xef4444,
  boxBody: 0xf8fafc,
  containerColors: [0x1d4ed8, 0xc2410c, 0x15803d, 0x6d28d9, 0xb91c1c],
  tankerSteel: 0xe2e8f0,
  shadow: 0x000000,
};

function createMaterial(color: number, roughness = 0.45, metalness = 0.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

function getCabColor(reg: string): number {
  let hash = 0;
  for (let i = 0; i < reg.length; i++) {
    hash = (hash << 5) - hash + reg.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.cabColors.length;
  return PALETTE.cabColors[index];
}

function getContainerColor(reg: string): number {
  let hash = 0;
  for (let i = 0; i < reg.length; i++) {
    hash = (hash << 5) - hash + reg.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash + 3) % PALETTE.containerColors.length;
  return PALETTE.containerColors[index];
}

/**
 * Creates low-poly wheel with black rubber tire and silver metallic rim
 */
function createWheel(radius = 0.38, width = 0.28): THREE.Group {
  const wheelGroup = new THREE.Group();

  // Tire rubber (aligned to roll forward along Z when rotated about X)
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = createMaterial(PALETTE.rubber, 0.75, 0.1);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  tire.receiveShadow = false;
  wheelGroup.add(tire);

  // Wheel rim (slightly inset)
  const rimGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width + 0.02, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = createMaterial(PALETTE.rim, 0.3, 0.6);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelGroup.add(rim);

  // Center hubcap lug
  const hubGeo = new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, width + 0.05, 6);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = createMaterial(PALETTE.chassis, 0.5, 0.2);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  wheelGroup.add(hub);

  return wheelGroup;
}

/**
 * Creates soft contact shadow decal underneath vehicle
 */
function createGroundShadow(length: number, width: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width * 1.25, length * 1.1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.shadow,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.03;
  return mesh;
}

/**
 * Builds realistic truck cab facing +Z with functional forward spotlights and volumetric light beams
 */
function createTruckCab(
  cabColorHex: number,
  length = 2.1,
  width = 1.9,
  height = 2.0,
): {
  cabGroup: THREE.Group;
  headlights: THREE.Mesh[];
  spotLight: THREE.SpotLight;
  lightCones: THREE.Mesh[];
} {
  const cabGroup = new THREE.Group();
  const cabMat = createMaterial(cabColorHex, 0.45, 0.2);
  const darkMat = createMaterial(PALETTE.darkTrim, 0.7, 0.2);
  const glassMat = new THREE.MeshStandardMaterial({
    color: PALETTE.glass,
    roughness: 0.15,
    metalness: 0.85,
    flatShading: true,
  });
  const chromeMat = createMaterial(PALETTE.chrome, 0.2, 0.8);

  // Lower chassis section of cab
  const lowerGeo = new THREE.BoxGeometry(width, 0.6, length);
  const lowerMesh = new THREE.Mesh(lowerGeo, darkMat);
  lowerMesh.position.set(0, 0.5, 0);
  lowerMesh.castShadow = true;
  cabGroup.add(lowerMesh);

  // Main cab body
  const bodyGeo = new THREE.BoxGeometry(width * 0.96, height * 0.75, length * 0.88);
  const bodyMesh = new THREE.Mesh(bodyGeo, cabMat);
  bodyMesh.position.set(0, 0.5 + height * 0.38, -0.05);
  bodyMesh.castShadow = true;
  cabGroup.add(bodyMesh);

  // Roof aerodynamic wind deflector / fairing
  const roofGeo = new THREE.BoxGeometry(width * 0.9, 0.38, length * 0.6);
  const roofMesh = new THREE.Mesh(roofGeo, cabMat);
  roofMesh.position.set(0, 0.5 + height * 0.75 + 0.16, -0.15);
  roofMesh.castShadow = true;
  cabGroup.add(roofMesh);

  // Windshield (front angled glass facing +Z)
  const windshieldGeo = new THREE.BoxGeometry(width * 0.84, height * 0.35, 0.08);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.5 + height * 0.46, length * 0.4 + 0.01);
  windshield.rotation.x = -0.12;
  cabGroup.add(windshield);

  // Side windows
  const sideWinGeo = new THREE.BoxGeometry(width * 1.01, height * 0.28, length * 0.38);
  const sideWindows = new THREE.Mesh(sideWinGeo, glassMat);
  sideWindows.position.set(0, 0.5 + height * 0.48, 0.05);
  cabGroup.add(sideWindows);

  // Front radiator grille
  const grilleGeo = new THREE.BoxGeometry(width * 0.6, height * 0.28, 0.06);
  const grille = new THREE.Mesh(grilleGeo, darkMat);
  grille.position.set(0, 0.62, length * 0.45 + 0.03);
  cabGroup.add(grille);

  // Front bumper bar
  const bumperGeo = new THREE.BoxGeometry(width * 1.02, 0.24, 0.2);
  const bumper = new THREE.Mesh(bumperGeo, darkMat);
  bumper.position.set(0, 0.32, length * 0.46);
  cabGroup.add(bumper);

  // Dual side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.08, 0.28, 0.14);
  const leftMirror = new THREE.Mesh(mirrorGeo, darkMat);
  leftMirror.position.set(-width * 0.54, 0.5 + height * 0.45, length * 0.25);
  const rightMirror = new THREE.Mesh(mirrorGeo, darkMat);
  rightMirror.position.set(width * 0.54, 0.5 + height * 0.45, length * 0.25);
  cabGroup.add(leftMirror);
  cabGroup.add(rightMirror);

  // Glowing Headlights lenses
  const hlMat = new THREE.MeshBasicMaterial({ color: PALETTE.headlightGlow });
  const hlGeo = new THREE.BoxGeometry(0.24, 0.14, 0.05);
  const leftHL = new THREE.Mesh(hlGeo, hlMat);
  leftHL.position.set(-width * 0.38, 0.34, length * 0.48 + 0.06);
  const rightHL = new THREE.Mesh(hlGeo, hlMat);
  rightHL.position.set(width * 0.38, 0.34, length * 0.48 + 0.06);
  cabGroup.add(leftHL);
  cabGroup.add(rightHL);

  // Forward SpotLight (casting an authentic pool of light in front of the truck along +Z)
  const spotLight = new THREE.SpotLight(0xfffaed, 3.2, 36, Math.PI / 5.2, 0.45, 1.2);
  spotLight.position.set(0, 0.5, length * 0.48);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.2, length * 0.48 + 24);
  cabGroup.add(spotTarget);
  spotLight.target = spotTarget;
  cabGroup.add(spotLight);

  // Volumetric translucent light beams
  const coneGeo = new THREE.ConeGeometry(2.2, 14, 10, 1, true);
  coneGeo.rotateX(Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfffaed,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const leftCone = new THREE.Mesh(coneGeo, coneMat);
  leftCone.position.set(-width * 0.38, 0.34, length * 0.48 + 7);
  const rightCone = new THREE.Mesh(coneGeo, coneMat);
  rightCone.position.set(width * 0.38, 0.34, length * 0.48 + 7);
  cabGroup.add(leftCone);
  cabGroup.add(rightCone);

  // Vertical chrome exhaust pipe behind cab
  const exhaustGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8);
  const exhaust = new THREE.Mesh(exhaustGeo, chromeMat);
  exhaust.position.set(width * 0.42, 1.4, -length * 0.42);
  cabGroup.add(exhaust);

  return {
    cabGroup,
    headlights: [leftHL, rightHL],
    spotLight,
    lightCones: [leftCone, rightCone],
  };
}

/**
 * Creates heavy multi-axle freight carrier (32ft MXL style)
 */
export function createHeavyTruck(vehicle: MockVehicle): THREE.Group {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const cabColor = getCabColor(vehicle.registration_number);

  const totalLength = 8.8;
  const bodyWidth = 2.1;
  const boxLength = 6.2;
  const boxHeight = 2.4;

  // Steel chassis beam
  const chassisGeo = new THREE.BoxGeometry(bodyWidth * 0.75, 0.3, totalLength);
  const chassisMat = createMaterial(PALETTE.chassis, 0.7, 0.3);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0.4, 0);
  chassis.castShadow = true;
  root.add(chassis);

  // Ground shadow
  root.add(createGroundShadow(totalLength, bodyWidth));

  // Front Cab (facing +Z)
  const { cabGroup, headlights, spotLight, lightCones } = createTruckCab(cabColor, 2.0, 1.95, 2.1);
  cabGroup.position.set(0, 0, totalLength * 0.38);
  root.add(cabGroup);

  // Long Cargo Box Body
  const boxGeo = new THREE.BoxGeometry(bodyWidth, boxHeight, boxLength);
  const boxMat = createMaterial(PALETTE.boxBody, 0.45, 0.15);
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.position.set(0, 0.4 + boxHeight * 0.5 + 0.12, -totalLength * 0.12);
  boxMesh.castShadow = true;
  root.add(boxMesh);

  // Cargo box side accent livery stripe
  const stripeGeo = new THREE.BoxGeometry(bodyWidth + 0.02, 0.3, boxLength * 0.95);
  const stripeMat = createMaterial(cabColor, 0.4, 0.2);
  const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
  stripeMesh.position.set(0, 0.4 + boxHeight * 0.5, -totalLength * 0.12);
  root.add(stripeMesh);

  // Rear bumper with glowing red taillights and rear illumination
  const rearBumperGeo = new THREE.BoxGeometry(bodyWidth, 0.2, 0.15);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.32, -totalLength * 0.48);
  root.add(rearBumper);

  const tlMat = new THREE.MeshBasicMaterial({ color: PALETTE.taillightGlow });
  const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.04);
  const leftTL = new THREE.Mesh(tlGeo, tlMat);
  leftTL.position.set(-bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  const rightTL = new THREE.Mesh(tlGeo, tlMat);
  rightTL.position.set(bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  root.add(leftTL);
  root.add(rightTL);

  const rearPointLight = new THREE.PointLight(0xef4444, 0.9, 7);
  rearPointLight.position.set(0, 0.35, -totalLength * 0.52);
  root.add(rearPointLight);

  // Wheels: 1 front steering axle + 2 rear dual-wheel axles
  const wheelPositions = [
    { x: -bodyWidth * 0.48, z: totalLength * 0.38 }, // front left
    { x: bodyWidth * 0.48, z: totalLength * 0.38 },  // front right
    { x: -bodyWidth * 0.48, z: -totalLength * 0.22 }, // mid-rear left
    { x: bodyWidth * 0.48, z: -totalLength * 0.22 },  // mid-rear right
    { x: -bodyWidth * 0.48, z: -totalLength * 0.38 }, // back-rear left
    { x: bodyWidth * 0.48, z: -totalLength * 0.38 },  // back-rear right
  ];

  wheelPositions.forEach((pos) => {
    const w = createWheel(0.38, 0.26);
    w.position.set(pos.x, 0.38, pos.z);
    root.add(w);
    const tireMesh = w.children[0] as THREE.Mesh;
    if (tireMesh) wheels.push(tireMesh);
  });

  const userData: Vehicle3DUserData = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    truckType: vehicle.truck_type,
    vehicleData: vehicle,
    wheels,
    headlights,
    headlightSpot: spotLight,
    headlightCones: lightCones,
    taillights: [leftTL, rightTL],
    rearPointLight,
    baseY: 0,
    forwardAxis: 'z',
  };
  root.userData = userData;

  return root;
}

/**
 * Creates Container Carrier truck with shipping container
 */
export function createContainerTruck(vehicle: MockVehicle): THREE.Group {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const cabColor = getCabColor(vehicle.registration_number);
  const containerColor = getContainerColor(vehicle.registration_number);

  const totalLength = 8.5;
  const bodyWidth = 2.1;
  const containerLength = 5.8;
  const containerHeight = 2.25;

  // Flatbed trailer chassis
  const chassisGeo = new THREE.BoxGeometry(bodyWidth * 0.85, 0.28, totalLength);
  const chassisMat = createMaterial(PALETTE.chassis, 0.7, 0.3);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0.38, 0);
  chassis.castShadow = true;
  root.add(chassis);

  // Ground shadow
  root.add(createGroundShadow(totalLength, bodyWidth));

  // Front Cab
  const { cabGroup, headlights, spotLight, lightCones } = createTruckCab(cabColor, 2.0, 1.95, 2.05);
  cabGroup.position.set(0, 0, totalLength * 0.36);
  root.add(cabGroup);

  // Main Shipping Container
  const containerGeo = new THREE.BoxGeometry(bodyWidth * 0.98, containerHeight, containerLength);
  const containerMat = createMaterial(containerColor, 0.5, 0.2);
  const containerMesh = new THREE.Mesh(containerGeo, containerMat);
  containerMesh.position.set(0, 0.38 + containerHeight * 0.5 + 0.12, -totalLength * 0.14);
  containerMesh.castShadow = true;
  root.add(containerMesh);

  // Corrugated vertical side ribs
  const ribMat = createMaterial(containerColor, 0.55, 0.15);
  for (let z = -containerLength * 0.42; z <= containerLength * 0.42; z += 0.5) {
    const ribGeo = new THREE.BoxGeometry(bodyWidth * 1.02, containerHeight * 0.92, 0.08);
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(0, 0.38 + containerHeight * 0.5 + 0.12, -totalLength * 0.14 + z);
    root.add(rib);
  }

  // Corner twistlock castings
  const cornerMat = createMaterial(PALETTE.chrome, 0.4, 0.6);
  const cornerGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const corners = [
    [-bodyWidth * 0.48, 0.45, -totalLength * 0.14 + containerLength * 0.48],
    [bodyWidth * 0.48, 0.45, -totalLength * 0.14 + containerLength * 0.48],
    [-bodyWidth * 0.48, 0.45 + containerHeight, -totalLength * 0.14 + containerLength * 0.48],
    [bodyWidth * 0.48, 0.45 + containerHeight, -totalLength * 0.14 + containerLength * 0.48],
    [-bodyWidth * 0.48, 0.45, -totalLength * 0.14 - containerLength * 0.48],
    [bodyWidth * 0.48, 0.45, -totalLength * 0.14 - containerLength * 0.48],
    [-bodyWidth * 0.48, 0.45 + containerHeight, -totalLength * 0.14 - containerLength * 0.48],
    [bodyWidth * 0.48, 0.45 + containerHeight, -totalLength * 0.14 - containerLength * 0.48],
  ];
  corners.forEach(([x, y, z]) => {
    const c = new THREE.Mesh(cornerGeo, cornerMat);
    c.position.set(x, y, z);
    root.add(c);
  });

  // Rear bumper with taillights and rear light
  const rearBumperGeo = new THREE.BoxGeometry(bodyWidth, 0.2, 0.15);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.32, -totalLength * 0.48);
  root.add(rearBumper);

  const tlMat = new THREE.MeshBasicMaterial({ color: PALETTE.taillightGlow });
  const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.04);
  const leftTL = new THREE.Mesh(tlGeo, tlMat);
  leftTL.position.set(-bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  const rightTL = new THREE.Mesh(tlGeo, tlMat);
  rightTL.position.set(bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  root.add(leftTL);
  root.add(rightTL);

  const rearPointLight = new THREE.PointLight(0xef4444, 0.9, 7);
  rearPointLight.position.set(0, 0.35, -totalLength * 0.52);
  root.add(rearPointLight);

  // Wheels
  const wheelPositions = [
    { x: -bodyWidth * 0.48, z: totalLength * 0.36 },
    { x: bodyWidth * 0.48, z: totalLength * 0.36 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.22 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.22 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.38 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.38 },
  ];
  wheelPositions.forEach((pos) => {
    const w = createWheel(0.38, 0.26);
    w.position.set(pos.x, 0.38, pos.z);
    root.add(w);
    const tireMesh = w.children[0] as THREE.Mesh;
    if (tireMesh) wheels.push(tireMesh);
  });

  const userData: Vehicle3DUserData = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    truckType: vehicle.truck_type,
    vehicleData: vehicle,
    wheels,
    headlights,
    headlightSpot: spotLight,
    headlightCones: lightCones,
    taillights: [leftTL, rightTL],
    rearPointLight,
    baseY: 0,
    forwardAxis: 'z',
  };
  root.userData = userData;

  return root;
}

/**
 * Creates chemical / petroleum Tanker truck
 */
export function createTankerTruck(vehicle: MockVehicle): THREE.Group {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const cabColor = getCabColor(vehicle.registration_number);

  const totalLength = 8.6;
  const bodyWidth = 2.1;
  const tankRadius = 1.05;
  const tankLength = 5.7;

  // Chassis
  const chassisGeo = new THREE.BoxGeometry(bodyWidth * 0.8, 0.3, totalLength);
  const chassisMat = createMaterial(PALETTE.chassis, 0.7, 0.3);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0.38, 0);
  chassis.castShadow = true;
  root.add(chassis);

  // Ground shadow
  root.add(createGroundShadow(totalLength, bodyWidth));

  // Front Cab
  const { cabGroup, headlights, spotLight, lightCones } = createTruckCab(cabColor, 2.0, 1.95, 2.05);
  cabGroup.position.set(0, 0, totalLength * 0.36);
  root.add(cabGroup);

  // Cylindrical Tank
  const tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankLength, 16);
  tankGeo.rotateX(Math.PI / 2);
  const tankMat = createMaterial(PALETTE.tankerSteel, 0.25, 0.65);
  const tankMesh = new THREE.Mesh(tankGeo, tankMat);
  tankMesh.position.set(0, 0.38 + tankRadius + 0.1, -totalLength * 0.13);
  tankMesh.castShadow = true;
  root.add(tankMesh);

  // Rounded front and rear tank end caps
  const capGeo = new THREE.SphereGeometry(tankRadius, 14, 10);
  capGeo.scale(1, 1, 0.45);
  const frontCap = new THREE.Mesh(capGeo, tankMat);
  frontCap.position.set(0, 0.38 + tankRadius + 0.1, -totalLength * 0.13 + tankLength * 0.5);
  const rearCap = new THREE.Mesh(capGeo, tankMat);
  rearCap.position.set(0, 0.38 + tankRadius + 0.1, -totalLength * 0.13 - tankLength * 0.5);
  root.add(frontCap);
  root.add(rearCap);

  // Top catwalk and ladder
  const catwalkGeo = new THREE.BoxGeometry(bodyWidth * 0.4, 0.08, tankLength * 0.85);
  const catwalkMat = createMaterial(PALETTE.darkTrim, 0.6, 0.3);
  const catwalk = new THREE.Mesh(catwalkGeo, catwalkMat);
  catwalk.position.set(0, 0.38 + tankRadius * 2 + 0.14, -totalLength * 0.13);
  root.add(catwalk);

  // Hazard placard diamonds
  const placardGeo = new THREE.BoxGeometry(bodyWidth * 1.05, 0.3, 0.3);
  placardGeo.rotateZ(Math.PI / 4);
  const placardMat = createMaterial(0xdc2626, 0.4, 0.1);
  const placard = new THREE.Mesh(placardGeo, placardMat);
  placard.position.set(0, 0.38 + tankRadius + 0.1, -totalLength * 0.13);
  root.add(placard);

  // Rear bumper with taillights and rear light
  const rearBumperGeo = new THREE.BoxGeometry(bodyWidth, 0.2, 0.15);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.32, -totalLength * 0.48);
  root.add(rearBumper);

  const tlMat = new THREE.MeshBasicMaterial({ color: PALETTE.taillightGlow });
  const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.04);
  const leftTL = new THREE.Mesh(tlGeo, tlMat);
  leftTL.position.set(-bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  const rightTL = new THREE.Mesh(tlGeo, tlMat);
  rightTL.position.set(bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  root.add(leftTL);
  root.add(rightTL);

  const rearPointLight = new THREE.PointLight(0xef4444, 0.9, 7);
  rearPointLight.position.set(0, 0.35, -totalLength * 0.52);
  root.add(rearPointLight);

  // Wheels
  const wheelPositions = [
    { x: -bodyWidth * 0.48, z: totalLength * 0.36 },
    { x: bodyWidth * 0.48, z: totalLength * 0.36 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.2 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.2 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.36 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.36 },
  ];
  wheelPositions.forEach((pos) => {
    const w = createWheel(0.38, 0.26);
    w.position.set(pos.x, 0.38, pos.z);
    root.add(w);
    const tireMesh = w.children[0] as THREE.Mesh;
    if (tireMesh) wheels.push(tireMesh);
  });

  const userData: Vehicle3DUserData = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    truckType: vehicle.truck_type,
    vehicleData: vehicle,
    wheels,
    headlights,
    headlightSpot: spotLight,
    headlightCones: lightCones,
    taillights: [leftTL, rightTL],
    rearPointLight,
    baseY: 0,
    forwardAxis: 'z',
  };
  root.userData = userData;

  return root;
}

/**
 * Creates Refrigerated (Reefer) truck with nose refrigeration unit
 */
export function createReeferTruck(vehicle: MockVehicle): THREE.Group {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const cabColor = getCabColor(vehicle.registration_number);

  const totalLength = 8.2;
  const bodyWidth = 2.1;
  const boxLength = 5.6;
  const boxHeight = 2.35;

  // Chassis
  const chassisGeo = new THREE.BoxGeometry(bodyWidth * 0.8, 0.3, totalLength);
  const chassisMat = createMaterial(PALETTE.chassis, 0.7, 0.3);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0.38, 0);
  chassis.castShadow = true;
  root.add(chassis);

  // Ground shadow
  root.add(createGroundShadow(totalLength, bodyWidth));

  // Front Cab
  const { cabGroup, headlights, spotLight, lightCones } = createTruckCab(cabColor, 2.0, 1.95, 2.05);
  cabGroup.position.set(0, 0, totalLength * 0.35);
  root.add(cabGroup);

  // White Insulated Reefer Box Body
  const boxGeo = new THREE.BoxGeometry(bodyWidth, boxHeight, boxLength);
  const boxMat = createMaterial(PALETTE.boxBody, 0.35, 0.05);
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.position.set(0, 0.38 + boxHeight * 0.5 + 0.12, -totalLength * 0.13);
  boxMesh.castShadow = true;
  root.add(boxMesh);

  // Front-Mounted Refrigeration Condenser Unit
  const reeferUnitGeo = new THREE.BoxGeometry(bodyWidth * 0.7, 0.7, 0.45);
  const reeferUnitMat = createMaterial(0x0284c7, 0.5, 0.2);
  const reeferUnit = new THREE.Mesh(reeferUnitGeo, reeferUnitMat);
  reeferUnit.position.set(0, 0.38 + boxHeight * 0.75, -totalLength * 0.13 + boxLength * 0.5 + 0.22);
  root.add(reeferUnit);

  // Reefer status LED
  const reeferLedMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const reeferLedGeo = new THREE.BoxGeometry(0.12, 0.08, 0.05);
  const reeferLed = new THREE.Mesh(reeferLedGeo, reeferLedMat);
  reeferLed.position.set(0, 0.38 + boxHeight * 0.75, -totalLength * 0.13 + boxLength * 0.5 + 0.45);
  root.add(reeferLed);

  // Rear bumper with taillights
  const rearBumperGeo = new THREE.BoxGeometry(bodyWidth, 0.2, 0.15);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.32, -totalLength * 0.48);
  root.add(rearBumper);

  const tlMat = new THREE.MeshBasicMaterial({ color: PALETTE.taillightGlow });
  const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.04);
  const leftTL = new THREE.Mesh(tlGeo, tlMat);
  leftTL.position.set(-bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  const rightTL = new THREE.Mesh(tlGeo, tlMat);
  rightTL.position.set(bodyWidth * 0.38, 0.32, -totalLength * 0.49);
  root.add(leftTL);
  root.add(rightTL);

  const rearPointLight = new THREE.PointLight(0xef4444, 0.9, 7);
  rearPointLight.position.set(0, 0.35, -totalLength * 0.52);
  root.add(rearPointLight);

  // Wheels
  const wheelPositions = [
    { x: -bodyWidth * 0.48, z: totalLength * 0.35 },
    { x: bodyWidth * 0.48, z: totalLength * 0.35 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.22 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.22 },
    { x: -bodyWidth * 0.48, z: -totalLength * 0.38 },
    { x: bodyWidth * 0.48, z: -totalLength * 0.38 },
  ];
  wheelPositions.forEach((pos) => {
    const w = createWheel(0.38, 0.26);
    w.position.set(pos.x, 0.38, pos.z);
    root.add(w);
    const tireMesh = w.children[0] as THREE.Mesh;
    if (tireMesh) wheels.push(tireMesh);
  });

  const userData: Vehicle3DUserData = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    truckType: vehicle.truck_type,
    vehicleData: vehicle,
    wheels,
    headlights,
    headlightSpot: spotLight,
    headlightCones: lightCones,
    taillights: [leftTL, rightTL],
    rearPointLight,
    baseY: 0,
    forwardAxis: 'z',
  };
  root.userData = userData;

  return root;
}

/**
 * Creates medium delivery / distribution truck
 */
export function createDeliveryTruck(vehicle: MockVehicle): THREE.Group {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const cabColor = getCabColor(vehicle.registration_number);

  const totalLength = 5.8;
  const bodyWidth = 1.85;
  const boxLength = 3.6;
  const boxHeight = 1.9;

  // Chassis
  const chassisGeo = new THREE.BoxGeometry(bodyWidth * 0.8, 0.25, totalLength);
  const chassisMat = createMaterial(PALETTE.chassis, 0.7, 0.3);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0.35, 0);
  chassis.castShadow = true;
  root.add(chassis);

  // Ground shadow
  root.add(createGroundShadow(totalLength, bodyWidth));

  // Front Cab (compact)
  const { cabGroup, headlights, spotLight, lightCones } = createTruckCab(cabColor, 1.7, 1.75, 1.75);
  cabGroup.position.set(0, 0, totalLength * 0.32);
  root.add(cabGroup);

  // Cargo Box
  const boxGeo = new THREE.BoxGeometry(bodyWidth, boxHeight, boxLength);
  const boxMat = createMaterial(0xfef3c7, 0.5, 0.1);
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.position.set(0, 0.35 + boxHeight * 0.5 + 0.1, -totalLength * 0.14);
  boxMesh.castShadow = true;
  root.add(boxMesh);

  // Rear bumper with taillights
  const rearBumperGeo = new THREE.BoxGeometry(bodyWidth, 0.18, 0.12);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.3, -totalLength * 0.46);
  root.add(rearBumper);

  const tlMat = new THREE.MeshBasicMaterial({ color: PALETTE.taillightGlow });
  const tlGeo = new THREE.BoxGeometry(0.2, 0.1, 0.04);
  const leftTL = new THREE.Mesh(tlGeo, tlMat);
  leftTL.position.set(-bodyWidth * 0.36, 0.3, -totalLength * 0.47);
  const rightTL = new THREE.Mesh(tlGeo, tlMat);
  rightTL.position.set(bodyWidth * 0.36, 0.3, -totalLength * 0.47);
  root.add(leftTL);
  root.add(rightTL);

  const rearPointLight = new THREE.PointLight(0xef4444, 0.7, 5);
  rearPointLight.position.set(0, 0.3, -totalLength * 0.49);
  root.add(rearPointLight);

  // Wheels: 1 front axle + 1 rear axle (4 wheels)
  const wheelPositions = [
    { x: -bodyWidth * 0.46, z: totalLength * 0.32 },
    { x: bodyWidth * 0.46, z: totalLength * 0.32 },
    { x: -bodyWidth * 0.46, z: -totalLength * 0.28 },
    { x: bodyWidth * 0.46, z: -totalLength * 0.28 },
  ];
  wheelPositions.forEach((pos) => {
    const w = createWheel(0.34, 0.24);
    w.position.set(pos.x, 0.34, pos.z);
    root.add(w);
    const tireMesh = w.children[0] as THREE.Mesh;
    if (tireMesh) wheels.push(tireMesh);
  });

  const userData: Vehicle3DUserData = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    truckType: vehicle.truck_type,
    vehicleData: vehicle,
    wheels,
    headlights,
    headlightSpot: spotLight,
    headlightCones: lightCones,
    taillights: [leftTL, rightTL],
    rearPointLight,
    baseY: 0,
    forwardAxis: 'z',
  };
  root.userData = userData;

  return root;
}

/**
 * Main Vehicle Factory: builds appropriate 3D model based on truck_type
 */
export function build3DVehicle(vehicle: MockVehicle): THREE.Group {
  const t = (vehicle.truck_type || '').toLowerCase();
  if (t.includes('container') || t.includes('20ft')) {
    return createContainerTruck(vehicle);
  }
  if (t.includes('tanker')) {
    return createTankerTruck(vehicle);
  }
  if (t.includes('reefer') || t.includes('refrigerat')) {
    return createReeferTruck(vehicle);
  }
  if (t.includes('delivery') || t.includes('light')) {
    return createDeliveryTruck(vehicle);
  }
  // Default: heavy cargo carrier (32ft MXL)
  return createHeavyTruck(vehicle);
}

/**
 * Clean disposal of Three.js hierarchies to prevent GPU/WebGL leaks
 */
export function dispose3DObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
  });
}
