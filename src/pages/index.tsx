import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import { useState, useEffect } from "react";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ASCII_LOGO = `

 ▄▄▄       ██▀███   ███▄    █  ▒█████  ▓█████▄ ▓█████ 
▒████▄    ▓██ ▒ ██▒ ██ ▀█   █ ▒██▒  ██▒▒██▀ ██▌▓█   ▀ 
▒██  ▀█▄  ▓██ ░▄█ ▒▓██  ▀█ ██▒▒██░  ██▒░██   █▌▒███   
░██▄▄▄▄██ ▒██▀▀█▄  ▓██▒  ▐▌██▒▒██   ██░░▓█▄   ▌▒▓█  ▄ 
 ▓█   ▓██▒░██▓ ▒██▒▒██░   ▓██░░ ████▓▒░░▒████▓ ░▒████▒
 ▒▒   ▓▒█░░ ▒▓ ░▒▓░░ ▒░   ▒ ▒ ░ ▒░▒░▒░  ▒▒▓  ▒ ░░ ▒░ ░
  ▒   ▒▒ ░  ░▒ ░ ▒░░ ░░   ░ ▒░  ░ ▒ ▒░  ░ ▒  ▒  ░ ░  ░
  ░   ▒     ░░   ░    ░   ░ ░ ░ ░ ░ ▒   ░ ░  ░    ░   
      ░  ░   ░              ░     ░ ░     ░       ░  ░
                                        ░             

`;

const TOTAL_DISK_TB = 3.1
const TOTAL_MEMORY_MB = 24026

interface Details {
  release: string;
  height: string;
  uptime: string;
  memory: string;
  storage: string;
  arnsResolutionTime: string;
  cpuUsage: string;
}

// height, peers (JSON)
const INFO = "https://arnode.asia/info"
// release (JSON)
const RELEASE = "https://arnode.asia/ar-io/info"
// uptime (JSON)
const UPTIME = "https://arnode.asia/ar-io/healthcheck"
// everything else (RAW TEXT)
const DETAILS = "https://arnode.asia/ar-io/__gateway_metrics"

function formatUptime(uptime: number) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function Home() {
  const [details, setDetails] = useState<Details>({
    release: "?",
    height: "?",
    uptime: "?",
    memory: "?",
    storage: "?",
    arnsResolutionTime: "?",
    cpuUsage: "?",
  });

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        console.log("Fetching details...");

        const detailsResponse = await fetch(DETAILS);
        const detailsText = await detailsResponse.text();
        console.log(detailsText);

        const releaseResponse = await fetch(RELEASE);
        const releaseData = await releaseResponse.json();
        console.log(releaseData);

        const infoResponse = await fetch(INFO);
        const infoData = await infoResponse.json();
        console.log(infoData);

        const uptimeResponse = await fetch(UPTIME);
        const uptimeData = await uptimeResponse.json();
        console.log(uptimeData);
        const data: Details = {
          release: releaseData.release,
          height: infoData.height.toString(),
          uptime: formatUptime(uptimeData.uptime),
          memory: "...",
          storage: "...",
          arnsResolutionTime: "...",
          cpuUsage: "...",
        }
        setDetails(data);
      } catch (error) {
        console.error("Error fetching node details:", error);
      }
    };
    fetchDetails();
    const interval = setInterval(fetchDetails, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`min-h-screen bg-zinc-900 text-cyan-400 p-4 ${geistMono.variable} font-mono`}>
      <div className="max-w-6xl mx-auto">
        {/* System Info Section */}
        <div>
          <p className="text-cyan-300">$ neofetch</p>
        </div>
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          <pre className="text-cyan-500 whitespace-pre text-xs md:text-sm">
            {ASCII_LOGO}
          </pre>
          <div className="text-sm space-y-1">
            <p className="text-cyan-300">gateway@<Link href="https://arnode.asia" className="text-cyan-300">arnode.asia</Link></p>
            <p className="border-b border-cyan-800 mb-2">----------------</p>
            <p><span className="text-cyan-300">OS:</span>Ubuntu 22.04 jammy</p>
            <p><span className="text-cyan-300">CPU:</span> AMD EPYC 9224 24-Core @ 10x 2.496GHz</p>
            <p><span className="text-cyan-300">CPU Usage:</span> {details.cpuUsage}</p>
            <p><span className="text-cyan-300">Release:</span> {details.release}</p>
            <p><span className="text-cyan-300">Height:</span> {details.height}</p>
            <p><span className="text-cyan-300">Uptime:</span> {details.uptime}</p>
            <p><span className="text-cyan-300">Memory:</span> {details.memory}</p>
            <p><span className="text-cyan-300">Storage:</span> {details.storage}</p>
            <p><span className="text-cyan-300">ArNS Resolution time:</span> {details.arnsResolutionTime}</p>
          </div>
        </div>

        {/* Command History */}
        <div className="space-y-4 text-sm">

          <div>
            <p className="text-cyan-300">$ cat /etc/maintainer</p>
            <div className="ml-4 mt-1 text-gray-400">
              <p>Managed by <Link href="https://betteridea.dev" target="_blank" className="text-cyan-300">BetterIDEa</Link> team</p>
            </div>
          </div>

          <div>
            <p className="text-cyan-300">$ ls /tools</p>
            <div className="ml-4 mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <a href="/storage" className="hover:text-cyan-300 transition-colors">
                  BetterIDEa
                </a>
                <span className="text-gray-500">- IDE for AO</span>
              </div>
              <div className="flex items-center gap-2">
                <a href="/network" className="hover:text-cyan-300 transition-colors">
                  APM
                </a>
                <span className="text-gray-500">- AO Package Manager</span>
              </div>
              <div className="flex items-center gap-2">
                <a href="/gateway" className="hover:text-cyan-300 transition-colors">
                  Visual AO
                </a>
                <span className="text-gray-500">- No Code Programming for AO processes</span>
              </div>
              <div className="flex items-center gap-2">
                <a href="/gateway" className="hover:text-cyan-300 transition-colors">
                  APM CLI Tool
                </a>
                <span className="text-gray-500">- CLI Tool to publish APM packages</span>
              </div>
              <div className="flex items-center gap-2">
                <a href="/gateway" className="hover:text-cyan-300 transition-colors">
                  LUA Code Cells
                </a>
                <span className="text-gray-500">- AO Code Cells that can be added to any webapp</span>
              </div>
            </div>
          </div>

          {/* Live Command Line */}
          <div className="flex items-center">
            <span className="text-cyan-300">gateway@<Link href="https://arnode.asia" className="text-cyan-300">arnode.asia</Link>:~$</span>
            <div className="ml-2 h-4 w-2 bg-cyan-400 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
