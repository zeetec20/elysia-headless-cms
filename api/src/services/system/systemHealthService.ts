export interface SystemHealthData {
  status: 'healthy'
  uptime: number
  timestamp: string
}

export const getSystemHealthStatusService = (): SystemHealthData => ({
  status: 'healthy',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
})
