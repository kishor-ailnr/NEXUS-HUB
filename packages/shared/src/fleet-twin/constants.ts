import { WhatIfParams } from './types';

export const DEFAULT_WHAT_IF_PARAMS: WhatIfParams = {
  rain_severity_multiplier: 1.0,
  toll_strike_hours: 0,
  breakdown_hours: 0,
};

export const CHECKPOINT_TYPE_LABELS: Record<string, string> = {
  toll_plaza: 'FASTag Toll Plaza',
  fuel_station: 'Highway Fuel Station',
  rest_stop: 'Dhaba / Driver Rest Area',
  city_bypass: 'City Ring Road / Bypass',
  border_checkpost: 'State Border / RTO Checkpost',
  weigh_bridge: 'Commercial Weighbridge',
  ghat_section: 'Mountain Ghat / Hairpin Corridor',
};

export const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  weather: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  toll_delay: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  traffic: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
  driver_break: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  fuel_check: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  ghat_slowdown: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  night_driving: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  inspection: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
};

