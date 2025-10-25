export type LogTypes = "success" | "error" | "warning" | "info" | "debug" | "input" | "output"

// Simple logger with meaningful colors for different log types
export function log({ type, label, data, duration }: { type: LogTypes, label: string, data: string | object, duration?: number }) {
    const colors: Record<LogTypes, string> = {
        'success': '#00ee00',    // Green - successful operations
        'error': '#dc2626',      // Red - errors and failures
        'warning': '#ea580c',    // Orange - warnings and cautions
        'info': '#2563eb',       // Blue - general information
        'debug': '#7c3aed',      // Purple - debug information
        'input': '#0891b2',      // Cyan - incoming data/requests
        'output': '#059669'      // Emerald - outgoing data/responses
    }

    // Get color for type or default to blue
    const typeColor = colors[type] || colors.info

    // Format duration display
    const durationText = duration !== undefined ? ` ${Math.round(duration)}ms` : ''

    // Create styled console output with meaningful colors
    console.groupCollapsed(
        `%c${label}%c${durationText}`,
        `color: ${typeColor}; font-weight: bold;`,
        'color: #6b7280; font-weight: normal;'
    )
    console.log(data)
    console.groupEnd()
}

export async function withDuration<T>(fn: () => Promise<T>): Promise<{ result: T, duration: number }> {
    const startTime = performance.now()
    const result = await fn()
    const endTime = performance.now()
    const duration = endTime - startTime
    return { result, duration }
}