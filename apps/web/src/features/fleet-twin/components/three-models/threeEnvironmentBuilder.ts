import * as THREE from 'three';

// Low-poly environment color palette
const ENV_PALETTE = {
  grass: 0x6ca344,
  grassDark: 0x5e913a,
  concrete: 0x94a3b8,
  concreteLight: 0xcfd8dc,
  asphalt: 0x272c36,
  asphaltDark: 0x1e232d,
  roadMarking: 0xf8fafc,
  roadYellow: 0xfacc15,
  warehouseWall: 0x1e293b,
  warehouseTrim: 0x3b82f6,
  warehouseRoof: 0x334155,
  shutter: 0x64748b,
  hazardYellow: 0xeab308,
  hazardDark: 0x0f172a,
  woodPallet: 0xb45309,
  cardboard: 0xd97706,
  trunk: 0x78350f,
  pineGreen1: 0x15803d,
  pineGreen2: 0x166534,
  pineGreen3: 0x14532d,
  treeGreen1: 0x22c55e,
  treeGreen2: 0x4ade80,
  treeGreen3: 0x16a34a,
  lampMetal: 0x475569,
  lampGlow: 0xfef08a,
  lampLight: 0xfde047,
  tollRoof: 0x0284c7,
  tollGantry: 0x0369a1,
  fastagLaser: 0x22c55e,
  dhabaWall: 0xd97706,
  dhabaRoof: 0x15803d,
  signBg: 0x0f172a,
  signText: 0xfacc15,
};

function createStdMat(color: number, roughness = 0.6, metalness = 0.15): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

/**
 * Creates low-poly conifer / pine tree with 3-tier stacked cones
 */
export function createPineTree(scale = 1.0): THREE.Group {
  const tree = new THREE.Group();
  const trunkMat = createStdMat(ENV_PALETTE.trunk, 0.9, 0.0);
  const foliageMat1 = createStdMat(ENV_PALETTE.pineGreen1, 0.7, 0.0);
  const foliageMat2 = createStdMat(ENV_PALETTE.pineGreen2, 0.7, 0.0);
  const foliageMat3 = createStdMat(ENV_PALETTE.pineGreen3, 0.7, 0.0);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, 1.4 * scale, 6);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.7 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  // Bottom cone
  const c1Geo = new THREE.ConeGeometry(1.6 * scale, 1.8 * scale, 7);
  const c1 = new THREE.Mesh(c1Geo, foliageMat1);
  c1.position.y = 1.9 * scale;
  c1.castShadow = true;
  tree.add(c1);

  // Middle cone
  const c2Geo = new THREE.ConeGeometry(1.25 * scale, 1.5 * scale, 7);
  const c2 = new THREE.Mesh(c2Geo, foliageMat2);
  c2.position.y = 2.8 * scale;
  c2.castShadow = true;
  tree.add(c2);

  // Top cone
  const c3Geo = new THREE.ConeGeometry(0.85 * scale, 1.3 * scale, 7);
  const c3 = new THREE.Mesh(c3Geo, foliageMat3);
  c3.position.y = 3.6 * scale;
  c3.castShadow = true;
  tree.add(c3);

  return tree;
}

/**
 * Creates low-poly round deciduous tree
 */
export function createDeciduousTree(scale = 1.0): THREE.Group {
  const tree = new THREE.Group();
  const trunkMat = createStdMat(ENV_PALETTE.trunk, 0.9, 0.0);
  const canopyMat = createStdMat(ENV_PALETTE.treeGreen1, 0.75, 0.0);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 1.8 * scale, 6);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.9 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  // Canopy (faceted icosahedron)
  const canopyGeo = new THREE.IcosahedronGeometry(1.5 * scale, 1);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 2.6 * scale;
  canopy.castShadow = true;
  tree.add(canopy);

  return tree;
}

/**
 * Creates roadside streetlamp with curved arm, glowing head and real downward PointLight
 */
export function createStreetLamp(): { lampGroup: THREE.Group; lightMesh: THREE.Mesh; pointLight: THREE.PointLight } {
  const lampGroup = new THREE.Group();
  const poleMat = createStdMat(ENV_PALETTE.lampMetal, 0.5, 0.4);
  const glowMat = new THREE.MeshBasicMaterial({ color: ENV_PALETTE.lampGlow });

  // Vertical pole
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.2, 6);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 2.6;
  pole.castShadow = true;
  lampGroup.add(pole);

  // Horizontal cantilever arm
  const armGeo = new THREE.BoxGeometry(1.4, 0.08, 0.08);
  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(0.65, 5.15, 0);
  lampGroup.add(arm);

  // Lamp head fixture
  const headGeo = new THREE.BoxGeometry(0.4, 0.1, 0.25);
  const head = new THREE.Mesh(headGeo, poleMat);
  head.position.set(1.3, 5.1, 0);
  lampGroup.add(head);

  // Glowing bulb surface
  const bulbGeo = new THREE.BoxGeometry(0.32, 0.04, 0.2);
  const bulb = new THREE.Mesh(bulbGeo, glowMat);
  bulb.position.set(1.3, 5.04, 0);
  lampGroup.add(bulb);

  // Downward illumination point light for night mode
  const pointLight = new THREE.PointLight(ENV_PALETTE.lampLight, 1.9, 22, 1.2);
  pointLight.position.set(1.3, 4.8, 0);
  lampGroup.add(pointLight);

  return { lampGroup, lightMesh: bulb, pointLight };
}

/**
 * Creates roadside fuel station canopy with dispensers and overhead illumination
 */
export function createFuelStation(): THREE.Group {
  const station = new THREE.Group();
  const metalMat = createStdMat(0x475569, 0.4, 0.5);
  const canopyMat = createStdMat(0x0284c7, 0.5, 0.2);
  const whiteMat = createStdMat(0xf8fafc, 0.6, 0.1);
  const pumpMat = createStdMat(0xdc2626, 0.4, 0.2);

  // Ground concrete pad
  const padGeo = new THREE.BoxGeometry(16, 0.12, 11);
  const pad = new THREE.Mesh(padGeo, createStdMat(ENV_PALETTE.concreteLight, 0.8, 0.05));
  pad.position.set(0, 0.06, 0);
  pad.receiveShadow = true;
  station.add(pad);

  // Canopy roof
  const roofGeo = new THREE.BoxGeometry(14, 0.6, 9.5);
  const roof = new THREE.Mesh(roofGeo, canopyMat);
  roof.position.set(0, 4.2, 0);
  roof.castShadow = true;
  station.add(roof);

  // Canopy brand fascia trim (white stripe with glowing green text)
  const fasciaGeo = new THREE.BoxGeometry(14.1, 0.25, 9.6);
  const fascia = new THREE.Mesh(fasciaGeo, whiteMat);
  fascia.position.set(0, 4.2, 0);
  station.add(fascia);

  // 4 Support pillars
  const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 4.0, 8);
  const pillarPositions = [
    [-5.0, 2.0, -3.2],
    [5.0, 2.0, -3.2],
    [-5.0, 2.0, 3.2],
    [5.0, 2.0, 3.2],
  ];
  pillarPositions.forEach(([x, y, z]) => {
    const p = new THREE.Mesh(pillarGeo, metalMat);
    p.position.set(x, y, z);
    p.castShadow = true;
    station.add(p);
  });

  // 2 Fuel dispenser pump islands
  const pumpIslandGeo = new THREE.BoxGeometry(1.0, 0.2, 4.2);
  const pumpGeo = new THREE.BoxGeometry(0.6, 1.4, 0.8);
  [-2.5, 2.5].forEach((x) => {
    const island = new THREE.Mesh(pumpIslandGeo, createStdMat(ENV_PALETTE.concrete, 0.7, 0.1));
    island.position.set(x, 0.15, 0);
    station.add(island);

    [-1.0, 1.0].forEach((z) => {
      const pump = new THREE.Mesh(pumpGeo, pumpMat);
      pump.position.set(x, 0.85, z);
      pump.castShadow = true;
      station.add(pump);
    });
  });

  // Canopy overhead light for night illumination
  const canopyLight = new THREE.PointLight(0xfffbeb, 2.2, 18, 1.0);
  canopyLight.position.set(0, 3.8, 0);
  station.add(canopyLight);

  return station;
}

/**
 * Creates Highway Toll Plaza with 3 lanes, FASTag scanner, and boom barriers
 */
export function createTollPlaza(): {
  tollGroup: THREE.Group;
  boomArm: THREE.Mesh;
  laserBeam: THREE.Mesh;
  statusLeds: THREE.Mesh[];
  tollLight: THREE.PointLight;
} {
  const tollGroup = new THREE.Group();
  const boothMat = createStdMat(0x0284c7, 0.5, 0.2);
  const gantryMat = createStdMat(0x0369a1, 0.4, 0.3);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.2,
    metalness: 0.8,
  });

  // Concrete island dividers (4 islands separating 3 lanes)
  const islandWidth = 1.0;
  const islandLength = 8.0;
  const laneWidth = 4.2;
  const islandXPositions = [-laneWidth * 1.5, -laneWidth * 0.5, laneWidth * 0.5, laneWidth * 1.5];

  const statusLeds: THREE.Mesh[] = [];

  islandXPositions.forEach((x, idx) => {
    // Concrete divider
    const islandGeo = new THREE.BoxGeometry(islandWidth, 0.3, islandLength);
    const island = new THREE.Mesh(islandGeo, createStdMat(ENV_PALETTE.concrete, 0.8, 0.1));
    island.position.set(x, 0.15, 0);
    island.receiveShadow = true;
    tollGroup.add(island);

    // Toll booth cabin
    const boothGeo = new THREE.BoxGeometry(0.85, 2.4, 2.2);
    const booth = new THREE.Mesh(boothGeo, boothMat);
    booth.position.set(x, 1.35, 0);
    booth.castShadow = true;
    tollGroup.add(booth);

    // Booth window
    const winGeo = new THREE.BoxGeometry(0.88, 0.9, 1.6);
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(x, 1.6, 0);
    tollGroup.add(win);

    // LED Status Beacon on booth
    const ledMat = new THREE.MeshBasicMaterial({ color: idx === 1 ? 0x22c55e : 0xef4444 });
    const ledGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(x, 2.7, 0);
    tollGroup.add(led);
    statusLeds.push(led);
  });

  // Overhead Gantry Roof spanning all lanes
  const spanWidth = laneWidth * 3 + islandWidth * 2;
  const roofGeo = new THREE.BoxGeometry(spanWidth + 2.0, 0.5, 4.5);
  const roof = new THREE.Mesh(roofGeo, gantryMat);
  roof.position.set(0, 4.4, 0);
  roof.castShadow = true;
  tollGroup.add(roof);

  // Gantry Pillars
  const leftPillarGeo = new THREE.BoxGeometry(0.6, 4.4, 0.6);
  const leftPillar = new THREE.Mesh(leftPillarGeo, gantryMat);
  leftPillar.position.set(-spanWidth * 0.5 - 0.5, 2.2, 0);
  tollGroup.add(leftPillar);

  const rightPillar = new THREE.Mesh(leftPillarGeo, gantryMat);
  rightPillar.position.set(spanWidth * 0.5 + 0.5, 2.2, 0);
  tollGroup.add(rightPillar);

  // Animated Boom Barrier Arm on Lane 2 (main through lane)
  const boomArmGeo = new THREE.BoxGeometry(3.6, 0.12, 0.12);
  const boomArmMat = createStdMat(0xef4444, 0.5, 0.1);
  const boomArm = new THREE.Mesh(boomArmGeo, boomArmMat);
  boomArm.position.set(0, 0.9, 1.8);
  tollGroup.add(boomArm);

  // FASTag Laser Scanner Beam
  const laserGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6);
  const laserMat = new THREE.MeshBasicMaterial({
    color: ENV_PALETTE.fastagLaser,
    transparent: true,
    opacity: 0.8,
  });
  const laserBeam = new THREE.Mesh(laserGeo, laserMat);
  laserBeam.position.set(0, 2.4, 1.2);
  tollGroup.add(laserBeam);

  // Overhead floodlight illuminating the toll lanes in night mode
  const tollLight = new THREE.PointLight(0xfffbeb, 2.5, 25, 1.1);
  tollLight.position.set(0, 4.2, 0);
  tollGroup.add(tollLight);

  return { tollGroup, boomArm, laserBeam, statusLeds, tollLight };
}

/**
 * Creates Highway Dhaba & Driver Rest Facility with marked truck parking bays,
 * illuminated signage, and warm porch lighting (Section 5)
 */
export function createDhabaRestStop(): {
  dhabaGroup: THREE.Group;
  dhabaLight: THREE.PointLight;
} {
  const dhabaGroup = new THREE.Group();
  const wallMat = createStdMat(ENV_PALETTE.dhabaWall, 0.7, 0.1);
  const canopyMat = createStdMat(ENV_PALETTE.dhabaRoof, 0.6, 0.1);
  const woodMat = createStdMat(ENV_PALETTE.trunk, 0.8, 0.05);

  // 1. Concrete building pad
  const padGeo = new THREE.BoxGeometry(18, 0.12, 14);
  const pad = new THREE.Mesh(padGeo, createStdMat(ENV_PALETTE.concrete, 0.8, 0.1));
  pad.position.set(0, 0.06, -3);
  pad.receiveShadow = true;
  dhabaGroup.add(pad);

  // 2. Main Dhaba restaurant building
  const bldgGeo = new THREE.BoxGeometry(14, 3.4, 7);
  const bldg = new THREE.Mesh(bldgGeo, wallMat);
  bldg.position.set(0, 1.7, -4.5);
  bldg.castShadow = true;
  dhabaGroup.add(bldg);

  // Glowing windows for warm night ambience
  const winMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  [-4, 0, 4].forEach((wx) => {
    const winGeo = new THREE.BoxGeometry(1.8, 1.2, 0.1);
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(wx, 1.8, -0.95);
    dhabaGroup.add(win);
  });

  // 3. Slanted Canopy Veranda Roof
  const canopyGeo = new THREE.BoxGeometry(15, 0.25, 5);
  canopyGeo.rotateX(0.12);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 3.2, 0.5);
  canopy.castShadow = true;
  dhabaGroup.add(canopy);

  // 4. Large glowing restaurant rooftop sign: "HIGHWAY OASIS DHABA"
  const signBoardGeo = new THREE.BoxGeometry(10, 1.2, 0.2);
  const signBoard = new THREE.Mesh(signBoardGeo, createStdMat(ENV_PALETTE.signBg, 0.6, 0.2));
  signBoard.position.set(0, 4.1, -4.2);
  dhabaGroup.add(signBoard);

  const signTextGeo = new THREE.BoxGeometry(9.4, 0.5, 0.22);
  const signTextMat = new THREE.MeshBasicMaterial({ color: ENV_PALETTE.signText });
  const signText = new THREE.Mesh(signTextGeo, signTextMat);
  signText.position.set(0, 4.1, -4.2);
  dhabaGroup.add(signText);

  // 5. Wooden picnic benches
  const benchGeo = new THREE.BoxGeometry(2.0, 0.5, 1.0);
  [-4, 0, 4].forEach((bx) => {
    const bench = new THREE.Mesh(benchGeo, woodMat);
    bench.position.set(bx, 0.35, 1.2);
    bench.castShadow = true;
    dhabaGroup.add(bench);
  });

  // 6. Warm porch floodlight for night illumination
  const dhabaLight = new THREE.PointLight(0xfef08a, 2.4, 24, 1.1);
  dhabaLight.position.set(0, 3.2, 1.5);
  dhabaGroup.add(dhabaLight);

  return { dhabaGroup, dhabaLight };
}

/**
 * Creates modern Logistics Distribution Center Warehouse with loading docks
 */
export function createLogisticsWarehouse(): {
  warehouseGroup: THREE.Group;
  dockDoors: THREE.Mesh[];
  yardLight: THREE.PointLight;
} {
  const warehouseGroup = new THREE.Group();

  const wallMat = createStdMat(ENV_PALETTE.warehouseWall, 0.65, 0.2);
  const trimMat = createStdMat(ENV_PALETTE.warehouseTrim, 0.5, 0.3);
  const roofMat = createStdMat(ENV_PALETTE.warehouseRoof, 0.7, 0.15);
  const shutterMat = createStdMat(ENV_PALETTE.shutter, 0.55, 0.3);
  const hazardMat = createStdMat(ENV_PALETTE.hazardYellow, 0.4, 0.1);
  const dockFloorMat = createStdMat(ENV_PALETTE.concrete, 0.8, 0.1);
  const metalMat = createStdMat(0x64748b, 0.5, 0.4);

  const bldgWidth = 38;
  const bldgDepth = 22;
  const bldgHeight = 7.5;

  // 1. Concrete Apron / Yard Pad
  const yardPadGeo = new THREE.BoxGeometry(bldgWidth + 14, 0.15, bldgDepth + 26);
  const yardPad = new THREE.Mesh(yardPadGeo, createStdMat(ENV_PALETTE.concrete, 0.85, 0.05));
  yardPad.position.set(0, 0.08, 6);
  yardPad.receiveShadow = true;
  warehouseGroup.add(yardPad);

  // 2. Main Warehouse Building Block
  const mainGeo = new THREE.BoxGeometry(bldgWidth, bldgHeight, bldgDepth);
  const mainBldg = new THREE.Mesh(mainGeo, wallMat);
  mainBldg.position.set(0, bldgHeight * 0.5 + 0.15, -4);
  mainBldg.castShadow = true;
  mainBldg.receiveShadow = true;
  warehouseGroup.add(mainBldg);

  // 3. Blue Trim Band around building perimeter
  const bandGeo = new THREE.BoxGeometry(bldgWidth + 0.2, 0.8, bldgDepth + 0.2);
  const band = new THREE.Mesh(bandGeo, trimMat);
  band.position.set(0, bldgHeight * 0.8, -4);
  warehouseGroup.add(band);

  // 4. Corrugated Low-Angle Roof
  const roofGeo = new THREE.BoxGeometry(bldgWidth + 1.2, 0.6, bldgDepth + 1.2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, bldgHeight + 0.45, -4);
  roof.castShadow = true;
  warehouseGroup.add(roof);

  // 5. HVAC units on roof
  [-10, 0, 10].forEach((hx) => {
    const hvacGeo = new THREE.BoxGeometry(2.4, 1.2, 2.0);
    const hvac = new THREE.Mesh(hvacGeo, metalMat);
    hvac.position.set(hx, bldgHeight + 1.2, -4);
    hvac.castShadow = true;
    warehouseGroup.add(hvac);
  });

  // 6. Raised Loading Dock Platform
  const dockPlatformWidth = 26;
  const dockHeight = 1.2;
  const dockDepth = 3.5;
  const dockPlatGeo = new THREE.BoxGeometry(dockPlatformWidth, dockHeight, dockDepth);
  const dockPlat = new THREE.Mesh(dockPlatGeo, dockFloorMat);
  dockPlat.position.set(0, dockHeight * 0.5 + 0.15, 8.5);
  dockPlat.receiveShadow = true;
  warehouseGroup.add(dockPlat);

  // Hazard Strip along dock
  const hazardGeo = new THREE.BoxGeometry(dockPlatformWidth + 0.05, 0.2, 0.2);
  const hazard = new THREE.Mesh(hazardGeo, hazardMat);
  hazard.position.set(0, dockHeight + 0.05, 10.2);
  warehouseGroup.add(hazard);

  // 7. Loading Bay Shutter Doors (4 active bays)
  const dockDoors: THREE.Mesh[] = [];
  const doorWidth = 3.6;
  const doorHeight = 4.2;
  const bayOffsets = [-8.7, -2.9, 2.9, 8.7];

  bayOffsets.forEach((bx) => {
    const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.15);
    const door = new THREE.Mesh(doorGeo, shutterMat);
    door.position.set(bx, dockHeight + doorHeight * 0.5 + 0.15, 7.1);
    warehouseGroup.add(door);
    dockDoors.push(door);

    const hoodGeo = new THREE.BoxGeometry(doorWidth + 0.6, 0.35, 1.2);
    const hood = new THREE.Mesh(hoodGeo, trimMat);
    hood.position.set(bx, dockHeight + doorHeight + 0.3, 7.6);
    warehouseGroup.add(hood);

    const plateGeo = new THREE.BoxGeometry(0.8, 0.4, 0.08);
    const plate = new THREE.Mesh(plateGeo, createStdMat(0xf8fafc, 0.4, 0.1));
    plate.position.set(bx, dockHeight + doorHeight + 0.8, 7.15);
    warehouseGroup.add(plate);

    // Staging bay markings
    const lineGeo = new THREE.BoxGeometry(0.12, 0.02, 12);
    const lineMat = new THREE.MeshBasicMaterial({ color: ENV_PALETTE.roadMarking });
    const lineL = new THREE.Mesh(lineGeo, lineMat);
    lineL.position.set(bx - 2.2, 0.17, 15);
    const lineR = new THREE.Mesh(lineGeo, lineMat);
    lineR.position.set(bx + 2.2, 0.17, 15);
    warehouseGroup.add(lineL);
    warehouseGroup.add(lineR);
  });

  // 8. Office Annex
  const annexGeo = new THREE.BoxGeometry(10, 4.5, 6);
  const annex = new THREE.Mesh(annexGeo, createStdMat(0x334155, 0.5, 0.2));
  annex.position.set(bldgWidth * 0.5 - 5, 2.4, 9.0);
  warehouseGroup.add(annex);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.15,
    metalness: 0.8,
  });
  const windowGeo = new THREE.BoxGeometry(8, 2.2, 0.1);
  const win = new THREE.Mesh(windowGeo, glassMat);
  win.position.set(bldgWidth * 0.5 - 5, 2.5, 12.06);
  warehouseGroup.add(win);

  // Yard floodlight for night illumination
  const yardLight = new THREE.PointLight(0xfffaed, 2.5, 35, 1.1);
  yardLight.position.set(0, 6.5, 14);
  warehouseGroup.add(yardLight);

  return { warehouseGroup, dockDoors, yardLight };
}

/**
 * Builds full 3D Isometric Logistics Scene (Terrain, Highway, Dhaba Parking Apron & Ramps,
 * Toll Plaza, Logistics Hub, Fuel Station, Illuminated Streetlamps, Trees)
 */
export function buildLogisticsEnvironment(): {
  environmentGroup: THREE.Group;
  streetLamps: THREE.Mesh[];
  streetPointLights: THREE.PointLight[];
  tollBoom: THREE.Mesh;
  tollLaser: THREE.Mesh;
  tollLeds: THREE.Mesh[];
  dockDoors: THREE.Mesh[];
  dhabaLight: THREE.PointLight;
  yardLight: THREE.PointLight;
} {
  const environmentGroup = new THREE.Group();
  const streetLamps: THREE.Mesh[] = [];
  const streetPointLights: THREE.PointLight[] = [];

  // ==========================================
  // 1. TERRAIN (Light-green lawn / grass plane)
  // ==========================================
  const groundGeo = new THREE.PlaneGeometry(380, 380, 32, 32);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = createStdMat(ENV_PALETTE.grass, 0.85, 0.02);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  environmentGroup.add(ground);

  // Subtle darker green patches for low-poly depth
  const patchGeo = new THREE.PlaneGeometry(180, 90);
  patchGeo.rotateX(-Math.PI / 2);
  const patchMat = createStdMat(ENV_PALETTE.grassDark, 0.9, 0.02);
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.position.set(-40, 0.01, -40);
  patch.receiveShadow = true;
  environmentGroup.add(patch);

  // ==========================================
  // 2. ROAD NETWORK (Dark-grey asphalt + markings)
  // ==========================================
  const roadMat = createStdMat(ENV_PALETTE.asphalt, 0.75, 0.15);
  const markingMat = new THREE.MeshBasicMaterial({ color: ENV_PALETTE.roadMarking });
  const yellowLineMat = new THREE.MeshBasicMaterial({ color: ENV_PALETTE.roadYellow });

  // Main Expressway Road (runs along X-axis from -160 to +160)
  const highwayWidth = 10.5;
  const highwayLength = 320;
  const mainRoadGeo = new THREE.PlaneGeometry(highwayLength, highwayWidth);
  mainRoadGeo.rotateX(-Math.PI / 2);
  const mainRoad = new THREE.Mesh(mainRoadGeo, roadMat);
  mainRoad.position.set(0, 0.04, 0);
  mainRoad.receiveShadow = true;
  environmentGroup.add(mainRoad);

  // Road Kerb Curbs
  const curbGeo = new THREE.BoxGeometry(highwayLength, 0.16, 0.35);
  const curbMat = createStdMat(ENV_PALETTE.concreteLight, 0.7, 0.1);
  const curbNorth = new THREE.Mesh(curbGeo, curbMat);
  curbNorth.position.set(0, 0.08, -highwayWidth * 0.5 - 0.18);
  const curbSouth = new THREE.Mesh(curbGeo, curbMat);
  curbSouth.position.set(0, 0.08, highwayWidth * 0.5 + 0.18);
  environmentGroup.add(curbNorth);
  environmentGroup.add(curbSouth);

  // Solid White Continuous Boundary Lines
  const edgeLineGeo = new THREE.PlaneGeometry(highwayLength, 0.18);
  edgeLineGeo.rotateX(-Math.PI / 2);
  const edgeLineNorth = new THREE.Mesh(edgeLineGeo, markingMat);
  edgeLineNorth.position.set(0, 0.05, -highwayWidth * 0.5 + 0.4);
  const edgeLineSouth = new THREE.Mesh(edgeLineGeo, markingMat);
  edgeLineSouth.position.set(0, 0.05, highwayWidth * 0.5 - 0.4);
  environmentGroup.add(edgeLineNorth);
  environmentGroup.add(edgeLineSouth);

  // Double Yellow Center Divider Lines
  const centerLineGeo = new THREE.PlaneGeometry(highwayLength, 0.12);
  centerLineGeo.rotateX(-Math.PI / 2);
  const cl1 = new THREE.Mesh(centerLineGeo, yellowLineMat);
  cl1.position.set(0, 0.05, -0.15);
  const cl2 = new THREE.Mesh(centerLineGeo, yellowLineMat);
  cl2.position.set(0, 0.05, 0.15);
  environmentGroup.add(cl1);
  environmentGroup.add(cl2);

  // Dashed White Lane Markings (4 total lanes)
  const dashLength = 2.4;
  const gapLength = 2.4;
  const totalDashes = Math.floor(highwayLength / (dashLength + gapLength));
  for (let i = -totalDashes / 2; i < totalDashes / 2; i++) {
    const dx = i * (dashLength + gapLength);
    const dashGeo = new THREE.PlaneGeometry(dashLength, 0.14);
    dashGeo.rotateX(-Math.PI / 2);

    const dashN = new THREE.Mesh(dashGeo, markingMat);
    dashN.position.set(dx, 0.05, -highwayWidth * 0.25);
    const dashS = new THREE.Mesh(dashGeo, markingMat);
    dashS.position.set(dx, 0.05, highwayWidth * 0.25);

    environmentGroup.add(dashN);
    environmentGroup.add(dashS);
  }

  // ==========================================
  // 3. DHABA DRIVER REST STOP (Section 5)
  // Dedicated parking apron & deceleration/acceleration ramps
  // ==========================================
  // Wide asphalt parking apron for trucks
  const dhabaApronWidth = 36;
  const dhabaApronDepth = 14;
  const dhabaApronGeo = new THREE.PlaneGeometry(dhabaApronWidth, dhabaApronDepth);
  dhabaApronGeo.rotateX(-Math.PI / 2);
  const dhabaApron = new THREE.Mesh(dhabaApronGeo, roadMat);
  dhabaApron.position.set(-32, 0.04, -14);
  dhabaApron.receiveShadow = true;
  environmentGroup.add(dhabaApron);

  // Entrance deceleration slip ramp (from x = -62, z = -5.25 to x = -48, z = -14)
  const entryRampGeo = new THREE.PlaneGeometry(16, 5.5);
  entryRampGeo.rotateX(-Math.PI / 2);
  entryRampGeo.rotateY(0.45);
  const entryRamp = new THREE.Mesh(entryRampGeo, roadMat);
  entryRamp.position.set(-54, 0.04, -9.5);
  environmentGroup.add(entryRamp);

  // Exit acceleration merge ramp (from x = -16, z = -14 to x = -2, z = -5.25)
  const exitRampGeo = new THREE.PlaneGeometry(16, 5.5);
  exitRampGeo.rotateX(-Math.PI / 2);
  exitRampGeo.rotateY(-0.45);
  const exitRamp = new THREE.Mesh(exitRampGeo, roadMat);
  exitRamp.position.set(-10, 0.04, -9.5);
  environmentGroup.add(exitRamp);

  // 4 Angled truck parking bays painted on dhaba apron
  const stallWidth = 5.2;
  const stallOffsets = [-42, -34, -26, -18];
  stallOffsets.forEach((sx) => {
    const stallLineGeo = new THREE.PlaneGeometry(0.12, 11);
    stallLineGeo.rotateX(-Math.PI / 2);
    stallLineGeo.rotateY(0.18); // Angled stall
    const sLine = new THREE.Mesh(stallLineGeo, markingMat);
    sLine.position.set(sx, 0.05, -14);
    environmentGroup.add(sLine);
  });

  // Dhaba building
  const { dhabaGroup, dhabaLight } = createDhabaRestStop();
  dhabaGroup.position.set(-32, 0, -22);
  environmentGroup.add(dhabaGroup);

  // ==========================================
  // 4. LOGISTICS HUB & T-JUNCTION ACCESS ROAD
  // ==========================================
  const accessRoadLength = 48;
  const accessRoadWidth = 8.0;
  const accessRoadGeo = new THREE.PlaneGeometry(accessRoadWidth, accessRoadLength);
  accessRoadGeo.rotateX(-Math.PI / 2);
  const accessRoad = new THREE.Mesh(accessRoadGeo, roadMat);
  accessRoad.position.set(35, 0.04, 28);
  accessRoad.receiveShadow = true;
  environmentGroup.add(accessRoad);

  // Dashed lane marking along access road
  for (let z = 6; z < accessRoadLength + 4; z += 4.5) {
    const accessDashGeo = new THREE.PlaneGeometry(0.14, 2.2);
    accessDashGeo.rotateX(-Math.PI / 2);
    const aDash = new THREE.Mesh(accessDashGeo, markingMat);
    aDash.position.set(35, 0.05, z);
    environmentGroup.add(aDash);
  }

  // Crosswalk at facility entrance
  for (let cx = 31.5; cx <= 38.5; cx += 1.2) {
    const zebraGeo = new THREE.PlaneGeometry(0.6, 3.2);
    zebraGeo.rotateX(-Math.PI / 2);
    const zebra = new THREE.Mesh(zebraGeo, markingMat);
    zebra.position.set(cx, 0.05, 12);
    environmentGroup.add(zebra);
  }

  // Logistics Warehouse Hub
  const { warehouseGroup, dockDoors, yardLight } = createLogisticsWarehouse();
  warehouseGroup.position.set(35, 0, 52);
  environmentGroup.add(warehouseGroup);

  // ==========================================
  // 5. TOLL PLAZA (Section 9)
  // ==========================================
  const { tollGroup, boomArm, laserBeam, statusLeds } = createTollPlaza();
  tollGroup.position.set(85, 0, 0);
  environmentGroup.add(tollGroup);

  // ==========================================
  // 6. FUEL STATION
  // ==========================================
  const fuelStation = createFuelStation();
  fuelStation.position.set(-75, 0, 18);
  environmentGroup.add(fuelStation);

  // ==========================================
  // 7. STREETLIGHTS ALONG HIGHWAY
  // ==========================================
  const lampXPositions = [-130, -95, -60, -25, 10, 45, 80, 115];
  lampXPositions.forEach((lx) => {
    // North side lamp
    const { lampGroup: lampN, lightMesh: bulbN, pointLight: pN } = createStreetLamp();
    lampN.position.set(lx, 0, -highwayWidth * 0.5 - 0.6);
    lampN.rotation.y = Math.PI;
    environmentGroup.add(lampN);
    streetLamps.push(bulbN);
    streetPointLights.push(pN);

    // South side lamp
    const { lampGroup: lampS, lightMesh: bulbS, pointLight: pS } = createStreetLamp();
    lampS.position.set(lx + 17, 0, highwayWidth * 0.5 + 0.6);
    lampS.rotation.y = 0;
    environmentGroup.add(lampS);
    streetLamps.push(bulbS);
    streetPointLights.push(pS);
  });

  // ==========================================
  // 8. LOW-POLY VEGETATION & SURROUNDINGS
  // ==========================================
  const treeConfigs: { type: 'pine' | 'round'; x: number; z: number; scale: number }[] = [
    { type: 'pine', x: -120, z: -18, scale: 1.1 },
    { type: 'round', x: -105, z: -22, scale: 1.2 },
    { type: 'pine', x: -85, z: -18, scale: 0.9 },
    { type: 'round', x: -55, z: -25, scale: 1.3 },
    { type: 'pine', x: -10, z: -24, scale: 1.0 },
    { type: 'round', x: 8, z: -20, scale: 1.15 },
    { type: 'pine', x: 25, z: -24, scale: 1.25 },
    { type: 'round', x: 50, z: -18, scale: 1.0 },
    { type: 'pine', x: 70, z: -22, scale: 1.2 },
    { type: 'round', x: 108, z: -18, scale: 1.1 },
    { type: 'pine', x: 125, z: -22, scale: 1.3 },

    { type: 'pine', x: -120, z: 20, scale: 1.2 },
    { type: 'round', x: -100, z: 24, scale: 1.1 },
    { type: 'pine', x: -50, z: 22, scale: 1.0 },
    { type: 'round', x: -22, z: 20, scale: 1.2 },
    { type: 'pine', x: 8, z: 22, scale: 1.1 },
    { type: 'round', x: 68, z: 24, scale: 1.3 },
    { type: 'pine', x: 78, z: 45, scale: 1.25 },
    { type: 'round', x: 74, z: 65, scale: 1.1 },
    { type: 'pine', x: -5, z: 48, scale: 1.2 },
    { type: 'round', x: -2, z: 68, scale: 1.3 },
    { type: 'pine', x: 118, z: 22, scale: 1.05 },
  ];

  treeConfigs.forEach(({ type, x, z, scale }) => {
    const tree = type === 'pine' ? createPineTree(scale) : createDeciduousTree(scale);
    tree.position.set(x, 0, z);
    environmentGroup.add(tree);
  });

  return {
    environmentGroup,
    streetLamps,
    streetPointLights,
    tollBoom: boomArm,
    tollLaser: laserBeam,
    tollLeds: statusLeds,
    dockDoors,
    dhabaLight,
    yardLight,
  };
}
