import { Hono } from 'hono'
import { execSync } from 'child_process'

const system = new Hono()

system.get('/system', (c) => {
    // Execute screenfetch and strip ANSI escape codes
    const screenfetch = execSync('screenfetch -n')
        .toString()
        .replace(/\u001b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .replace(/\u001b\[\d+[A-Z]/g, ''); // Remove ANSI control sequences

    // Extract system information using regex
    const cpuMatch = screenfetch.match(/CPU:\s*(.*)/);
    const ramMatch = screenfetch.match(/RAM:\s*(.*)/);
    const diskMatch = screenfetch.match(/Disk:\s*(.*)/);
    const osMatch = screenfetch.match(/OS:\s*(.*)/);

    const systemInfo = {
        cpu: cpuMatch ? cpuMatch[1].trim() : null,
        ram: ramMatch ? ramMatch[1].trim() : null,
        disk: diskMatch ? diskMatch[1].trim() : null,
        os: osMatch ? osMatch[1].trim() : null
    };

    return c.json(systemInfo)
})

export default system
