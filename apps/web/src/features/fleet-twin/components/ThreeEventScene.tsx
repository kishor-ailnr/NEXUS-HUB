import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCw,
  Sun,
  Moon,
  Layers,
  Eye,
  Maximize2,
  FastForward,
  Sparkles,
} from 'lucide-react';
import { MockPredictionEvent, PredictionEventType } from '@nexus-ways/shared';

interface ThreeEventSceneProps {
  currentEvent?: MockPredictionEvent | null;
  events?: MockPredictionEvent[];
  vehicleRegistration?: string;
  onEventSelected?: (event: MockPredictionEvent) => void;
}

export const ThreeEventScene: React.FC<ThreeEventSceneProps> = ({
  currentEvent,
  events = [],
  vehicleRegistration = 'TN 01 AB 1234',
  onEventSelected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [is3DMode, setIs3DMode] = useState(true);
  const [isNight, setIsNight] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 5 | 10>(1);
  const [timelineHour, setTimelineHour] = useState(0);

  // Mouse orbit state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef({ yaw: 0.45, pitch: 0.35, zoom: 1.0 });

  // Effective event type
  const eventType: PredictionEventType = useMemo(() => {
    if (currentEvent) return currentEvent.event_type;
    return 'toll_delay';
  }, [currentEvent]);

  // Handle timeline simulation scrubber loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimelineHour((prev) => {
        const next = prev + 0.2 * playSpeed;
        if (next >= 48) {
          setIsPlaying(false);
          return 0;
        }
        // Match current active event at this hour
        if (events.length > 0 && onEventSelected) {
          const matched = events.find(
            (e) => Math.abs(e.hours_from_now - next) < 1.0,
          );
          if (matched && matched.id !== currentEvent?.id) {
            onEventSelected(matched);
          }
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, events, currentEvent, onEventSelected]);

  // Main 3D / 2D Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Particle pool for rain / fog / dust / smoke
    const particles: { x: number; y: number; z: number; speed: number; size: number }[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 600,
        y: Math.random() * 400 - 200,
        z: (Math.random() - 0.5) * 600,
        speed: 2 + Math.random() * 4,
        size: 1 + Math.random() * 2.5,
      });
    }

    const render = () => {
      time += 0.03;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background Sky / Ambience
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (isNight) {
        bgGrad.addColorStop(0, '#020617');
        bgGrad.addColorStop(0.6, '#0f172a');
        bgGrad.addColorStop(1, '#1e1b4b');
      } else {
        if (eventType === 'weather') {
          bgGrad.addColorStop(0, '#1e293b');
          bgGrad.addColorStop(0.7, '#334155');
          bgGrad.addColorStop(1, '#475569');
        } else if (eventType === 'ghat_slowdown') {
          bgGrad.addColorStop(0, '#0c4a6e');
          bgGrad.addColorStop(0.7, '#075985');
          bgGrad.addColorStop(1, '#0284c7');
        } else {
          bgGrad.addColorStop(0, '#0f172a');
          bgGrad.addColorStop(0.6, '#1e293b');
          bgGrad.addColorStop(1, '#334155');
        }
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      if (!is3DMode) {
        render2DFallback(ctx, width, height, eventType, time, isNight);
      } else {
        render3DScene(ctx, width, height, eventType, time, isNight, particles);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [is3DMode, isNight, eventType]);

  // 3D Perspective Projection Engine
  const project3D = (
    x: number,
    y: number,
    z: number,
    cx: number,
    cy: number,
  ): { x: number; y: number; scale: number; visible: boolean } => {
    const yaw = cameraAngleRef.current.yaw;
    const pitch = cameraAngleRef.current.pitch;
    const zoom = cameraAngleRef.current.zoom;

    // Rotate around Y axis (yaw)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x1 = x * cosY - z * sinY;
    const z1 = z * cosY + x * sinY;

    // Rotate around X axis (pitch)
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const y2 = y * cosP - z1 * sinP;
    const z2 = z1 * cosP + y * sinP;

    // Perspective divide
    const cameraDist = 450 / zoom;
    const depth = z2 + cameraDist;
    if (depth <= 20) return { x: 0, y: 0, scale: 0, visible: false };

    const scale = cameraDist / depth;
    return {
      x: cx + x1 * scale,
      y: cy + y2 * scale,
      scale,
      visible: true,
    };
  };

  const render3DScene = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    type: PredictionEventType,
    t: number,
    night: boolean,
    particles: any[],
  ) => {
    const cx = width / 2;
    const cy = height / 2 + 30;

    // Grid Floor
    ctx.strokeStyle = night ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let gx = -300; gx <= 300; gx += 60) {
      const p1 = project3D(gx, 50, -300, cx, cy);
      const p2 = project3D(gx, 50, 300, cx, cy);
      if (p1.visible && p2.visible) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Asphalt Road
    const r1 = project3D(-120, 48, -320, cx, cy);
    const r2 = project3D(120, 48, -320, cx, cy);
    const r3 = project3D(120, 48, 320, cx, cy);
    const r4 = project3D(-120, 48, 320, cx, cy);

    if (r1.visible && r2.visible && r3.visible && r4.visible) {
      ctx.fillStyle = night ? '#111827' : '#1f2937';
      ctx.beginPath();
      ctx.moveTo(r1.x, r1.y);
      ctx.lineTo(r2.x, r2.y);
      ctx.lineTo(r3.x, r3.y);
      ctx.lineTo(r4.x, r4.y);
      ctx.closePath();
      ctx.fill();

      // Yellow Road Divider Dashes
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      const m1 = project3D(0, 47, -310, cx, cy);
      const m2 = project3D(0, 47, 310, cx, cy);
      if (m1.visible && m2.visible) {
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y);
        ctx.lineTo(m2.x, m2.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // SCENE-SPECIFIC 3D PROCEDURAL OBJECTS
    switch (type) {
      case 'toll_delay':
        renderTollPlaza3D(ctx, cx, cy, t, night);
        break;
      case 'weather':
        renderRainFog3D(ctx, cx, cy, t, night, particles);
        break;
      case 'traffic':
        renderTrafficJam3D(ctx, cx, cy, t, night);
        break;
      case 'driver_break':
        renderDhabaRestStop3D(ctx, cx, cy, t, night);
        break;
      case 'ghat_slowdown':
        renderGhatHairpin3D(ctx, cx, cy, t, night);
        break;
      default:
        renderTollPlaza3D(ctx, cx, cy, t, night);
        break;
    }

    // Main 3D Hero Truck
    renderHeroTruck3D(ctx, cx, cy, t, night, vehicleRegistration);
  };

  // 1. Toll Plaza 3D
  const renderTollPlaza3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
  ) => {
    // Toll Booth Columns
    const boothPos = [-70, 70];
    for (const bx of boothPos) {
      draw3DBox(ctx, cx, cy, bx, 20, 20, 24, 60, 30, '#0284c7', '#0369a1', '#075985');

      // LED Light Beacon (Green/Red Pulse)
      const isGreen = Math.sin(t * 1.5) > 0;
      const lp = project3D(bx, -18, 20, cx, cy);
      if (lp.visible) {
        ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
        ctx.shadowColor = isGreen ? '#22c55e' : '#ef4444';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, 5 * lp.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Overhead Canopy Roof
    draw3DBox(ctx, cx, cy, 0, -25, 20, 180, 12, 50, '#38bdf8', '#0284c7', '#0369a1');

    // Barrier Boom Arm (Animated Swing Up and Down)
    const armAngle = Math.max(0, Math.sin(t * 1.5)) * 0.9; // 0 to ~50 deg
    const bBase = project3D(58, 28, 22, cx, cy);
    const bTip = project3D(
      58 - 90 * Math.cos(armAngle),
      28 - 90 * Math.sin(armAngle),
      22,
      cx,
      cy,
    );
    if (bBase.visible && bTip.visible) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4 * bBase.scale;
      ctx.beginPath();
      ctx.moveTo(bBase.x, bBase.y);
      ctx.lineTo(bTip.x, bTip.y);
      ctx.stroke();

      // FASTag laser scanner beam
      if (armAngle > 0.3) {
        const scannerP = project3D(0, -22, 20, cx, cy);
        const truckScanP = project3D(0, 15, 60, cx, cy);
        if (scannerP.visible && truckScanP.visible) {
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(scannerP.x, scannerP.y);
          ctx.lineTo(truckScanP.x, truckScanP.y);
          ctx.stroke();
        }
      }
    }
  };

  // 2. Weather Rain & Fog 3D
  const renderRainFog3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
    particles: any[],
  ) => {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 1.2;

    for (const p of particles) {
      p.y += p.speed * 4;
      p.x -= 1.5; // Wind drift
      if (p.y > 60) {
        p.y = -220;
        p.x = (Math.random() - 0.5) * 600;
        p.z = (Math.random() - 0.5) * 600;
      }
      const p1 = project3D(p.x, p.y, p.z, cx, cy);
      const p2 = project3D(p.x - 4, p.y + 18, p.z, cx, cy);

      if (p1.visible && p2.visible) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Dense Hill Fog Volume (Concentric mist discs)
    const fogGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 240);
    fogGrad.addColorStop(0, 'rgba(148, 163, 184, 0.05)');
    fogGrad.addColorStop(0.5, 'rgba(203, 213, 225, 0.25)');
    fogGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  // 3. Traffic Jam 3D
  const renderTrafficJam3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
  ) => {
    // Queued commercial vehicles ahead
    const truckOffsets = [
      { z: -100, x: -45, color: '#f59e0b' },
      { z: -170, x: 45, color: '#3b82f6' },
      { z: -230, x: -40, color: '#10b981' },
      { z: -290, x: 38, color: '#8b5cf6' },
    ];

    for (const tr of truckOffsets) {
      const crawl = Math.sin(t + tr.z) * 5;
      draw3DBox(ctx, cx, cy, tr.x, 22, tr.z + crawl, 38, 40, 70, tr.color, '#334155', '#1e293b');

      // Glowing Brake Lights
      const isBraking = Math.sin(t * 2 + tr.z) > -0.2;
      const b1 = project3D(tr.x - 14, 32, tr.z + crawl + 36, cx, cy);
      const b2 = project3D(tr.x + 14, 32, tr.z + crawl + 36, cx, cy);
      if (b1.visible && b2.visible && isBraking) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b1.x, b1.y, 4 * b1.scale, 0, Math.PI * 2);
        ctx.arc(b2.x, b2.y, 4 * b2.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  };

  // 4. Dhaba Rest Stop 3D
  const renderDhabaRestStop3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
  ) => {
    // Roadside Dhaba Building
    draw3DBox(ctx, cx, cy, 180, 10, -50, 90, 45, 110, '#b45309', '#78350f', '#451a03');

    // Thatch Canopy Roof
    draw3DBox(ctx, cx, cy, 180, -22, -50, 110, 15, 130, '#d97706', '#92400e', '#78350f');

    // String Lights / Lanterns (Glowing in night mode)
    const lanternColors = ['#f59e0b', '#ef4444', '#10b981', '#38bdf8', '#fbbf24'];
    for (let i = 0; i < 5; i++) {
      const lx = 135 + i * 22;
      const lp = project3D(lx, -12, 16, cx, cy);
      if (lp.visible) {
        ctx.fillStyle = lanternColors[i];
        ctx.shadowColor = lanternColors[i];
        ctx.shadowBlur = night ? 14 : 4;
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, 4 * lp.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Tea stall smoke / chai steam particles
    const sp = project3D(145, -30 - (t * 15) % 40, -10, cx, cy);
    if (sp.visible) {
      ctx.fillStyle = 'rgba(241, 245, 249, 0.4)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6 * sp.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // 5. Ghat Hairpin 3D
  const renderGhatHairpin3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
  ) => {
    // Mountain Rock Cliff Side
    draw3DBox(ctx, cx, cy, -190, -40, -50, 100, 180, 240, '#475569', '#334155', '#1e293b');

    // Guard Rail Barrier Blocks along hairpins
    for (let gz = -180; gz <= 180; gz += 45) {
      const gb1 = project3D(125, 40, gz, cx, cy);
      const gb2 = project3D(125, 30, gz + 20, cx, cy);
      if (gb1.visible && gb2.visible) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(gb1.x, gb1.y, 8 * gb1.scale, 12 * gb1.scale);
      }
    }
  };

  // Main 3D Hero Commercial Truck
  const renderHeroTruck3D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    night: boolean,
    reg: string,
  ) => {
    const truckZ = 40;
    const truckX = 0;
    const vibrate = Math.sin(t * 12) * 0.8;

    // Chassis & Wheels
    const w1 = project3D(truckX - 22, 45, truckZ - 30, cx, cy);
    const w2 = project3D(truckX + 22, 45, truckZ - 30, cx, cy);
    const w3 = project3D(truckX - 22, 45, truckZ + 35, cx, cy);
    const w4 = project3D(truckX + 22, 45, truckZ + 35, cx, cy);
    ctx.fillStyle = '#0f172a';
    [w1, w2, w3, w4].forEach((w) => {
      if (w.visible) {
        ctx.beginPath();
        ctx.arc(w.x, w.y, 7 * w.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Main Freight Container Cargo Box
    draw3DBox(
      ctx,
      cx,
      cy,
      truckX,
      12 + vibrate,
      truckZ + 10,
      44,
      48,
      90,
      '#0284c7',
      '#0369a1',
      '#075985',
    );

    // Front Cabin
    draw3DBox(
      ctx,
      cx,
      cy,
      truckX,
      20 + vibrate,
      truckZ - 50,
      42,
      40,
      32,
      '#38bdf8',
      '#0284c7',
      '#0369a1',
    );

    // Windshield Glass
    const ws = project3D(truckX, 10 + vibrate, truckZ - 64, cx, cy);
    if (ws.visible) {
      ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
      ctx.fillRect(ws.x - 14 * ws.scale, ws.y - 8 * ws.scale, 28 * ws.scale, 16 * ws.scale);
    }

    // Headlights (High-beam cones in night or fog)
    const hlLeft = project3D(truckX - 16, 32 + vibrate, truckZ - 68, cx, cy);
    const hlRight = project3D(truckX + 16, 32 + vibrate, truckZ - 68, cx, cy);
    if (hlLeft.visible && hlRight.visible) {
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#fef08a';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(hlLeft.x, hlLeft.y, 4 * hlLeft.scale, 0, Math.PI * 2);
      ctx.arc(hlRight.x, hlRight.y, 4 * hlRight.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Projection Cones on Road
      if (night || eventType === 'weather') {
        const coneTargetL = project3D(truckX - 45, 48, truckZ - 220, cx, cy);
        const coneTargetR = project3D(truckX + 45, 48, truckZ - 220, cx, cy);
        if (coneTargetL.visible && coneTargetR.visible) {
          const coneGrad = ctx.createLinearGradient(
            hlLeft.x,
            hlLeft.y,
            coneTargetL.x,
            coneTargetL.y,
          );
          coneGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
          coneGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(hlLeft.x, hlLeft.y);
          ctx.lineTo(coneTargetL.x, coneTargetL.y);
          ctx.lineTo(coneTargetR.x, coneTargetR.y);
          ctx.lineTo(hlRight.x, hlRight.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  };

  // Generic 3D Cuboid helper with Lambertian shading
  const draw3DBox = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    cTop: string,
    cFront: string,
    cSide: string,
  ) => {
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;

    const p = [
      project3D(x - hw, y - hh, z - hd, cx, cy), // 0: top-front-left
      project3D(x + hw, y - hh, z - hd, cx, cy), // 1: top-front-right
      project3D(x + hw, y + hh, z - hd, cx, cy), // 2: bottom-front-right
      project3D(x - hw, y + hh, z - hd, cx, cy), // 3: bottom-front-left
      project3D(x - hw, y - hh, z + hd, cx, cy), // 4: top-back-left
      project3D(x + hw, y - hh, z + hd, cx, cy), // 5: top-back-right
      project3D(x + hw, y + hh, z + hd, cx, cy), // 6: bottom-back-right
      project3D(x - hw, y + hh, z + hd, cx, cy), // 7: bottom-back-left
    ];

    if (p.some((pt) => !pt.visible)) return;

    // Top face
    ctx.fillStyle = cTop;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    ctx.lineTo(p[1].x, p[1].y);
    ctx.lineTo(p[5].x, p[5].y);
    ctx.lineTo(p[4].x, p[4].y);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = cFront;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    ctx.lineTo(p[1].x, p[1].y);
    ctx.lineTo(p[2].x, p[2].y);
    ctx.lineTo(p[3].x, p[3].y);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = cSide;
    ctx.beginPath();
    ctx.moveTo(p[1].x, p[1].y);
    ctx.lineTo(p[5].x, p[5].y);
    ctx.lineTo(p[6].x, p[6].y);
    ctx.lineTo(p[2].x, p[2].y);
    ctx.closePath();
    ctx.fill();
  };

  // 2D Fallback Vector Engine
  const render2DFallback = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    type: PredictionEventType,
    t: number,
    night: boolean,
  ) => {
    const cx = width / 2;
    const cy = height / 2;

    ctx.fillStyle = night ? '#0f172a' : '#1e293b';
    ctx.fillRect(0, 0, width, height);

    // Highway Corridor
    ctx.fillStyle = '#334155';
    ctx.fillRect(40, cy - 40, width - 80, 80);

    ctx.strokeStyle = '#facc15';
    ctx.setLineDash([15, 12]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, cy);
    ctx.lineTo(width - 40, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2D Vehicle Marker
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(cx - 50, cy - 25, 100, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(vehicleRegistration, cx, cy + 4);

    // Event Overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '13px sans-serif';
    ctx.fillText(`2D Fallback Mode: ${type.toUpperCase()}`, cx, cy - 70);
  };

  // Mouse Orbit Drag Controls
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    cameraAngleRef.current.yaw += dx * 0.008;
    cameraAngleRef.current.pitch = Math.max(
      0.1,
      Math.min(1.2, cameraAngleRef.current.pitch + dy * 0.008),
    );
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl select-none">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        width={760}
        height={380}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-[380px] cursor-grab active:cursor-grabbing block"
      />

      {/* Top HUD Controls Overlay */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-semibold text-cyan-400 flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>3D DIGITAL TWIN SCENE</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-900/70 px-2 py-0.5 rounded border border-slate-800">
            {eventType.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setIsNight(!isNight)}
            title="Toggle Day / Night lighting"
            className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 transition-colors shadow-md"
          >
            {isNight ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
          </button>

          <button
            onClick={() => setIs3DMode(!is3DMode)}
            title="Toggle 3D / 2D Perspective"
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md ${
              is3DMode
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900/80 border-slate-700 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{is3DMode ? '3D Low-Poly' : '2D Fallback'}</span>
          </button>
        </div>
      </div>

      {/* Bottom Simulation Scrubber Bar */}
      <div className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-slate-200 shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-md shadow-cyan-950"
            title={isPlaying ? 'Pause Simulation' : 'Play 48h Future Trajectory'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <div className="text-xs">
            <div className="font-mono font-bold text-cyan-400">
              +{timelineHour.toFixed(1)}h Future Horizon
            </div>
            <div className="text-[10px] text-slate-400">
              {currentEvent ? currentEvent.location_name : 'National Freight Corridor'}
            </div>
          </div>
        </div>

        {/* Speed Toggle */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 text-xs">
          {([1, 5, 10] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setPlaySpeed(spd)}
              className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                playSpeed === spd
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>Click & drag on 3D canvas to orbit camera</span>
        </div>
      </div>
    </div>
  );
};

