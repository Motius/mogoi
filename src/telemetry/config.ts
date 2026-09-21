import type { MogoiConfig } from '../config/types.ts';

export type TelemetryDecision = {
  enabled: boolean;
  reason: string;
};

/** Treat unset/empty/0/false/no/off as "not enabled". */
function isFalsy(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off';
}

export function resolveTelemetryEnabled(
  config: Pick<MogoiConfig, 'telemetry'>,
  env: NodeJS.ProcessEnv = process.env,
): TelemetryDecision {
  const dnt = env.DO_NOT_TRACK;
  if (dnt !== undefined && !isFalsy(dnt)) {
    return { enabled: false, reason: 'DO_NOT_TRACK is set' };
  }

  if (env.MOGOI_TELEMETRY !== undefined) {
    if (isFalsy(env.MOGOI_TELEMETRY)) {
      return { enabled: false, reason: 'MOGOI_TELEMETRY opt-out' };
    }
    return { enabled: true, reason: 'MOGOI_TELEMETRY opt-in' };
  }

  if (config.telemetry?.enabled === false) {
    return { enabled: false, reason: 'telemetry.enabled=false in config' };
  }

  return { enabled: true, reason: 'enabled by default' };
}
