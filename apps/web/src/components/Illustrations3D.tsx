import React from 'react';

/**
 * High-Quality 3D Animated Illustrations for NEXUS WAYS Multimodal Platform
 * Pure vector SVG with CSS transforms, isometric lighting, and fluid keyframe animations.
 */

export const RoadwaysIllustration3D: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-44 flex items-center justify-center overflow-hidden select-none ${className}`}>
      {/* Ambient Radial Soft Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-emerald-500/5 to-transparent rounded-2xl pointer-events-none" />

      <svg
        viewBox="0 0 360 180"
        className="w-full h-full object-contain filter drop-shadow-md animate-float-subtle"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Isometric Road Platform */}
        <path
          d="M 30 140 L 160 70 L 330 110 L 200 175 Z"
          fill="#F1F5F9"
          stroke="#E2E8F0"
          strokeWidth="1.5"
        />
        {/* Road Surface */}
        <path
          d="M 45 136 L 160 76 L 315 113 L 200 169 Z"
          fill="#E2E8F0"
        />

        {/* Animated Dashed Center Lane */}
        <line
          x1="102"
          y1="106"
          x2="257"
          y2="141"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeDasharray="8 6"
          className="animate-road-dash"
        />

        {/* Soft Truck Shadow */}
        <ellipse cx="180" cy="138" rx="85" ry="16" fill="#0F172A" fillOpacity="0.08" />

        {/* 3D Logistics Truck Group */}
        <g transform="translate(100, 48)">
          {/* Main Trailer Body (Rear Box) */}
          {/* Left Side */}
          <path d="M 10 35 L 75 52 L 75 92 L 10 75 Z" fill="#2563EB" />
          {/* Top Roof */}
          <path d="M 10 35 L 65 15 L 130 32 L 75 52 Z" fill="#3B82F6" />
          {/* Right/Front Wall of Trailer */}
          <path d="M 75 52 L 130 32 L 130 72 L 75 92 Z" fill="#1D4ED8" />

          {/* Container Ridge Highlights */}
          <line x1="25" y1="39" x2="25" y2="79" stroke="#60A5FA" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="40" y1="43" x2="40" y2="83" stroke="#60A5FA" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="55" y1="47" x2="55" y2="87" stroke="#60A5FA" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="92" y1="46" x2="92" y2="86" stroke="#1E40AF" strokeWidth="1" />
          <line x1="110" y1="40" x2="110" y2="80" stroke="#1E40AF" strokeWidth="1" />

          {/* Container Branding Badge */}
          <rect x="22" y="52" width="38" height="14" rx="2" fill="#FFFFFF" fillOpacity="0.9" />
          <text x="26" y="62" fontSize="7" fontWeight="bold" fill="#1E40AF" fontFamily="sans-serif">NEXUS</text>

          {/* Cabin (Front Tractor) */}
          {/* Cabin Left Side */}
          <path d="M 130 52 L 165 62 L 165 92 L 130 82 Z" fill="#10B981" />
          {/* Cabin Top Roof with Aerodynamic Deflector */}
          <path d="M 130 52 L 150 44 L 185 54 L 165 62 Z" fill="#34D399" />
          {/* Cabin Front Face */}
          <path d="M 165 62 L 185 54 L 185 84 L 165 92 Z" fill="#059669" />

          {/* Windshield Glass Reflection */}
          <path d="M 166 65 L 182 58 L 182 70 L 166 77 Z" fill="#E0F2FE" fillOpacity="0.85" />
          <path d="M 168 67 L 176 63 L 176 69 L 168 73 Z" fill="#FFFFFF" fillOpacity="0.6" />

          {/* Chrome Front Grille & Headlights */}
          <rect x="170" y="78" width="12" height="5" rx="1" fill="#0F172A" />
          <circle cx="167" cy="88" r="2" fill="#FEF08A" className="animate-pulse" />
          <circle cx="183" cy="82" r="2" fill="#FEF08A" className="animate-pulse" />

          {/* Heavy Duty Wheels */}
          {/* Rear Wheels */}
          <ellipse cx="28" cy="80" rx="7" ry="9" fill="#0F172A" />
          <ellipse cx="28" cy="80" rx="3.5" ry="4.5" fill="#94A3B8" />

          <ellipse cx="48" cy="85" rx="7" ry="9" fill="#0F172A" />
          <ellipse cx="48" cy="85" rx="3.5" ry="4.5" fill="#94A3B8" />

          {/* Middle Wheels */}
          <ellipse cx="120" cy="84" rx="6.5" ry="8.5" fill="#0F172A" />
          <ellipse cx="120" cy="84" rx="3" ry="4" fill="#94A3B8" />

          {/* Steer Wheels (Front) */}
          <ellipse cx="155" cy="94" rx="6.5" ry="8.5" fill="#0F172A" />
          <ellipse cx="155" cy="94" rx="3" ry="4" fill="#94A3B8" />
        </g>

        {/* Floating Telemetry Beacons & Data Rings */}
        <g transform="translate(255, 30)" className="animate-float">
          <circle cx="20" cy="20" r="14" fill="#10B981" fillOpacity="0.12" stroke="#10B981" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="20" cy="20" r="6" fill="#10B981" />
          <path d="M 20 20 L 28 8" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="28" y="2" width="46" height="14" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))" />
          <text x="33" y="12" fontSize="7" fontWeight="bold" fill="#0F172A" fontFamily="monospace">GPS: LIVE</text>
        </g>
      </svg>
    </div>
  );
};

export const RailwaysIllustration3D: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-44 flex items-center justify-center overflow-hidden select-none ${className}`}>
      {/* Ambient Radial Soft Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-blue-500/5 to-transparent rounded-2xl pointer-events-none" />

      <svg
        viewBox="0 0 360 180"
        className="w-full h-full object-contain filter drop-shadow-md animate-float-subtle"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Isometric Rail Bed Platform */}
        <path
          d="M 20 145 L 170 65 L 340 115 L 190 175 Z"
          fill="#F8FAFC"
          stroke="#E2E8F0"
          strokeWidth="1.5"
        />

        {/* Ballast Stone Bed */}
        <path d="M 35 141 L 170 71 L 325 119 L 190 170 Z" fill="#E2E8F0" />

        {/* Railway Sleepers / Ties */}
        {[
          { x1: 50, y1: 135, x2: 75, y2: 147 },
          { x1: 85, y1: 120, x2: 110, y2: 132 },
          { x1: 120, y1: 105, x2: 145, y2: 117 },
          { x1: 155, y1: 90, x2: 180, y2: 102 },
          { x1: 190, y1: 75, x2: 215, y2: 87 },
          { x1: 225, y1: 95, x2: 250, y2: 107 },
          { x1: 260, y1: 110, x2: 285, y2: 122 },
        ].map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="#94A3B8"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ))}

        {/* Dual Steel Rails */}
        <path d="M 45 137 L 170 76 L 315 120" stroke="#64748B" strokeWidth="2.5" />
        <path d="M 60 144 L 185 83 L 330 127" stroke="#64748B" strokeWidth="2.5" />

        {/* Train Shadow */}
        <ellipse cx="180" cy="132" rx="95" ry="14" fill="#0F172A" fillOpacity="0.08" />

        {/* 3D Train Composition */}
        <g transform="translate(75, 45)">
          {/* Flatcar 1 with Container Stack */}
          <path d="M 15 50 L 55 35 L 55 65 L 15 80 Z" fill="#EA580C" />
          <path d="M 15 50 L 35 40 L 75 55 L 55 65 Z" fill="#F97316" />
          <path d="M 55 65 L 75 55 L 75 85 L 55 95 Z" fill="#C2410C" />

          {/* Flatcar 2 with Blue Container */}
          <path d="M 65 42 L 105 27 L 105 57 L 65 72 Z" fill="#2563EB" />
          <path d="M 65 42 L 85 32 L 125 47 L 105 57 Z" fill="#3B82F6" />
          <path d="M 105 57 L 125 47 L 125 77 L 105 87 Z" fill="#1D4ED8" />

          {/* Modern Electric High-Speed Locomotive */}
          {/* Left Cab Profile */}
          <path d="M 120 40 L 175 22 L 205 52 L 170 82 L 120 65 Z" fill="#1D4ED8" />
          {/* Aerodynamic Nose */}
          <path d="M 175 22 L 205 52 L 210 70 L 170 82 Z" fill="#2563EB" />
          <path d="M 120 40 L 140 32 L 195 44 L 175 52 Z" fill="#3B82F6" />

          {/* Windshield Visor */}
          <path d="M 180 34 L 198 52 L 194 58 L 176 40 Z" fill="#0F172A" />
          <path d="M 182 37 L 195 50 L 192 53 L 179 40 Z" fill="#38BDF8" fillOpacity="0.8" />

          {/* Yellow Hi-Vis Cowcatcher / Warning Band */}
          <path d="M 172 75 L 208 64 L 210 70 L 170 82 Z" fill="#F59E0B" />

          {/* High-Voltage Roof Pantograph */}
          <line x1="135" y1="35" x2="142" y2="20" stroke="#F59E0B" strokeWidth="2" />
          <line x1="142" y1="20" x2="152" y2="24" stroke="#F59E0B" strokeWidth="2" />
          <line x1="142" y1="20" x2="135" y2="12" stroke="#475569" strokeWidth="2" />
          <line x1="128" y1="12" x2="145" y2="12" stroke="#EF4444" strokeWidth="2" />

          {/* LED Dual Headlamps */}
          <circle cx="204" cy="62" r="2.5" fill="#FEF08A" className="animate-pulse" />
          <circle cx="198" cy="68" r="2.5" fill="#FEF08A" className="animate-pulse" />

          {/* Steel Flanged Wheels (Bogies) */}
          <circle cx="35" cy="85" r="5" fill="#334155" />
          <circle cx="50" cy="90" r="5" fill="#334155" />
          <circle cx="85" cy="77" r="5" fill="#334155" />
          <circle cx="100" cy="82" r="5" fill="#334155" />
          <circle cx="140" cy="72" r="5.5" fill="#1E293B" />
          <circle cx="158" cy="78" r="5.5" fill="#1E293B" />
        </g>

        {/* Smart Rail Signal Tower */}
        <g transform="translate(295, 40)" className="animate-float">
          <line x1="12" y1="8" x2="12" y2="55" stroke="#64748B" strokeWidth="3" />
          <rect x="2" y="4" width="20" height="26" rx="4" fill="#1E293B" stroke="#475569" strokeWidth="1" />
          <circle cx="12" cy="11" r="3.5" fill="#10B981" className="animate-pulse" />
          <circle cx="12" cy="22" r="3" fill="#334155" />
        </g>
      </svg>
    </div>
  );
};

export const AirwaysIllustration3D: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-44 flex items-center justify-center overflow-hidden select-none ${className}`}>
      {/* Ambient Radial Soft Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/10 via-teal-500/5 to-transparent rounded-2xl pointer-events-none" />

      <svg
        viewBox="0 0 360 180"
        className="w-full h-full object-contain filter drop-shadow-md animate-float"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Curved Great-Circle Atmospheric Trajectory */}
        <path
          d="M 30 150 Q 150 40 330 60"
          stroke="#0284C7"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          strokeOpacity="0.4"
        />

        {/* Altitude Horizon Waypoint Rings */}
        <ellipse cx="90" cy="120" rx="25" ry="8" stroke="#38BDF8" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
        <ellipse cx="200" cy="85" rx="35" ry="10" stroke="#0D9488" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
        <ellipse cx="300" cy="65" rx="20" ry="6" stroke="#0284C7" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />

        {/* Aircraft Ground Elevation Shadow */}
        <ellipse cx="170" cy="155" rx="55" ry="10" fill="#0F172A" fillOpacity="0.06" />

        {/* 3D Modern Wide-Body Cargo Jet */}
        <g transform="translate(100, 30)">
          {/* Left Wing (Angled down in perspective) */}
          <path d="M 65 60 L 15 95 L 30 100 L 85 70 Z" fill="#0284C7" />
          {/* Winglet */}
          <path d="M 15 95 L 12 85 L 18 87 L 22 97 Z" fill="#0D9488" />

          {/* Engine Pod 1 */}
          <ellipse cx="50" cy="80" rx="8" ry="11" fill="#0369A1" />
          <ellipse cx="48" cy="80" rx="4" ry="7" fill="#0F172A" />

          {/* Main Fuselage (Cylindrical body in isometric perspective) */}
          {/* Belly */}
          <path d="M 40 55 C 40 55, 60 70, 110 65 C 145 60, 175 45, 175 45 C 175 45, 140 40, 90 45 C 55 48, 40 55, 40 55 Z" fill="#E2E8F0" />
          {/* Top Cabin Surface */}
          <path d="M 40 55 C 40 55, 75 35, 130 35 C 160 35, 175 45, 175 45 C 175 45, 135 50, 90 52 C 55 52, 40 55, 40 55 Z" fill="#FFFFFF" />

          {/* Cockpit Visor Glass */}
          <path d="M 155 40 Q 168 43 172 45 Q 165 47 155 44 Z" fill="#0F172A" />
          <path d="M 157 41 Q 166 43 169 44 Q 164 45 157 43 Z" fill="#38BDF8" />

          {/* Cargo Door Outline */}
          <rect x="75" y="47" width="18" height="12" rx="1" stroke="#94A3B8" strokeWidth="1" fill="none" />
          <text x="78" y="55" fontSize="5" fontWeight="bold" fill="#0369A1" fontFamily="sans-serif">CARGO</text>

          {/* Right Wing (Far Wing in perspective) */}
          <path d="M 105 45 L 155 15 L 165 18 L 120 50 Z" fill="#0369A1" />
          {/* Far Winglet */}
          <path d="M 155 15 L 158 8 L 163 10 L 160 17 Z" fill="#0D9488" />

          {/* Engine Pod 2 (Far) */}
          <ellipse cx="130" cy="33" rx="6" ry="8" fill="#0284C7" />

          {/* Tail Fin & Stabilizers */}
          {/* Vertical Stabilizer */}
          <path d="M 45 53 L 20 18 L 32 18 L 65 48 Z" fill="#0284C7" />
          <path d="M 20 18 L 32 18 L 35 24 L 24 24 Z" fill="#0D9488" />
          {/* Horizontal Tail Wing */}
          <path d="M 40 50 L 18 42 L 25 45 L 50 52 Z" fill="#0369A1" />

          {/* Navigation Strobe Lights */}
          <circle cx="15" cy="85" r="2.5" fill="#EF4444" className="animate-pulse" />
          <circle cx="158" cy="8" r="2.5" fill="#10B981" className="animate-pulse" />
          <circle cx="20" cy="18" r="2" fill="#FFFFFF" className="animate-ping" />
        </g>

        {/* Telemetry Flight Tag */}
        <g transform="translate(240, 25)" className="animate-float-subtle">
          <rect x="0" y="0" width="75" height="28" rx="6" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))" />
          <text x="8" y="12" fontSize="7" fontWeight="bold" fill="#0284C7" fontFamily="sans-serif">FLIGHT: NW-840</text>
          <text x="8" y="22" fontSize="7.5" fontWeight="bold" fill="#0F172A" fontFamily="monospace">38,000 FT • 490 KTS</text>
        </g>
      </svg>
    </div>
  );
};

export const SeawaysIllustration3D: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full h-44 flex items-center justify-center overflow-hidden select-none ${className}`}>
      {/* Ambient Radial Soft Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-blue-500/5 to-transparent rounded-2xl pointer-events-none" />

      <svg
        viewBox="0 0 360 180"
        className="w-full h-full object-contain filter drop-shadow-md animate-float-subtle"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Animated Ocean Wave Surface Lines */}
        <g className="animate-wave-motion" opacity="0.6">
          <path d="M 10 135 Q 40 130 70 135 T 130 135 T 190 135 T 250 135 T 310 135 T 350 135" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
          <path d="M 25 150 Q 55 145 85 150 T 145 150 T 205 150 T 265 150 T 325 150 T 360 150" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 0 165 Q 30 160 60 165 T 120 165 T 180 165 T 240 165 T 300 165 T 350 165" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Vessel Water Wake & Shadow */}
        <ellipse cx="180" cy="138" rx="80" ry="14" fill="#0284C7" fillOpacity="0.12" />

        {/* 3D Modern Container Mega-Vessel (ULCV) */}
        <g transform="translate(85, 45)">
          {/* Lower Hull (Red antifouling boot-topping bottom) */}
          <path d="M 25 90 L 165 72 L 195 78 L 180 94 L 35 102 Z" fill="#DC2626" />

          {/* Main Freeboard Hull (Dark Navy Blue) */}
          <path d="M 25 78 L 165 60 L 195 66 L 195 78 L 25 90 Z" fill="#0369A1" />
          {/* Bow Flare / Deck Top */}
          <path d="M 25 78 L 40 70 L 175 52 L 195 66 Z" fill="#0284C7" />

          {/* Bulbous Bow Wake Effect */}
          <circle cx="196" cy="74" r="3.5" fill="#FFFFFF" fillOpacity="0.8" className="animate-ping" />

          {/* Tiered Colorful Container Stacks */}
          {/* Bay 1: Turquoise / Teal Stacks */}
          <path d="M 45 62 L 75 56 L 75 42 L 45 48 Z" fill="#0D9488" />
          <path d="M 45 48 L 60 44 L 90 50 L 75 56 Z" fill="#14B8A6" />
          <path d="M 75 56 L 90 50 L 90 64 L 75 70 Z" fill="#0F766E" />

          {/* Bay 2: Orange / Coral Stacks */}
          <path d="M 80 55 L 110 49 L 110 35 L 80 41 Z" fill="#EA580C" />
          <path d="M 80 41 L 95 37 L 125 43 L 110 49 Z" fill="#F97316" />
          <path d="M 110 49 L 125 43 L 125 57 L 110 63 Z" fill="#C2410C" />

          {/* Bay 3: Royal Blue Stacks */}
          <path d="M 115 48 L 145 42 L 145 28 L 115 34 Z" fill="#1D4ED8" />
          <path d="M 115 34 L 130 30 L 160 36 L 145 42 Z" fill="#3B82F6" />
          <path d="M 145 42 L 160 36 L 160 50 L 145 56 Z" fill="#1E40AF" />

          {/* Bridge Superstructure (Deckhouse / Tower) */}
          <path d="M 148 38 L 170 34 L 170 12 L 148 16 Z" fill="#FFFFFF" />
          <path d="M 170 34 L 180 36 L 180 14 L 170 12 Z" fill="#F1F5F9" />
          {/* Bridge Windows Glass Visor */}
          <rect x="154" y="18" width="14" height="4" fill="#0284C7" />
          <rect x="171" y="19" width="7" height="3" fill="#0369A1" />

          {/* Funnel / Exhaust Stack with NEXUS Blue Line */}
          <path d="M 140 22 L 146 21 L 146 10 L 140 11 Z" fill="#1E293B" />
          <rect x="140" y="14" width="6" height="2" fill="#0284C7" />

          {/* Radar Mast & Navigation Beacon */}
          <line x1="160" y1="12" x2="160" y2="2" stroke="#64748B" strokeWidth="1.5" />
          <line x1="156" y1="4" x2="164" y2="4" stroke="#64748B" strokeWidth="1" />
          <circle cx="160" cy="2" r="1.5" fill="#10B981" className="animate-pulse" />
        </g>

        {/* Ocean Navigation Telemetry Buoy */}
        <g transform="translate(280, 110)" className="animate-float">
          <ellipse cx="14" cy="22" rx="10" ry="3" fill="#0F172A" fillOpacity="0.1" />
          <path d="M 8 20 L 14 6 L 20 20 Z" fill="#F59E0B" stroke="#D97706" strokeWidth="1" />
          <circle cx="14" cy="5" r="2" fill="#10B981" className="animate-pulse" />
          <text x="5" y="32" fontSize="6" fontWeight="bold" fill="#0284C7" fontFamily="monospace">BUOY #04</text>
        </g>
      </svg>
    </div>
  );
};

