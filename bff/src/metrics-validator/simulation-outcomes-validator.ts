const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

type SimulationSevenDayWindowUtc = {
  anchorTimestampUtc: string
  windowStartUtc: string
  windowEndUtc: string
  timezone: 'UTC'
}

function buildSimulationSevenDayWindowUtc(
  pageLoadTimestampUtc: string
): SimulationSevenDayWindowUtc {
  const anchorTimeMs = Date.parse(pageLoadTimestampUtc)
  if (!Number.isFinite(anchorTimeMs)) {
    throw new Error(
      `Invalid page-load timestamp for simulation seven-day window anchoring: ${pageLoadTimestampUtc}`
    )
  }

  const windowEndUtc = new Date(anchorTimeMs).toISOString()
  const windowStartUtc = new Date(anchorTimeMs - SEVEN_DAY_WINDOW_MS).toISOString()

  return {
    anchorTimestampUtc: windowEndUtc,
    windowStartUtc,
    windowEndUtc,
    timezone: 'UTC'
  }
}

export {
  buildSimulationSevenDayWindowUtc,
  type SimulationSevenDayWindowUtc
}
